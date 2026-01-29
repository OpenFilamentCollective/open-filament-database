import { spawn } from 'node:child_process';
import path from 'node:path';
import { activeJobs, type Job, tryAcquireValidationLock, releaseValidationLock } from './jobManager';

export async function triggerBackgroundValidation(): Promise<boolean> {
	// Atomically try to acquire the validation lock to prevent race conditions
	if (!tryAcquireValidationLock()) {
		console.log('[ValidationTrigger] Validation already running, skipping');
		return false;
	}

	const jobId = 'validation-current';

	// Clean up old validation-current job if it exists and is complete
	const existingJob = activeJobs.get(jobId);
	if (existingJob && (existingJob.status === 'complete' || existingJob.status === 'error')) {
		activeJobs.delete(jobId);
	}

	// Build Python command arguments
	const args = ['-m', 'ofd', 'validate', '--json', '--progress'];
	const repoRoot = path.resolve(process.cwd(), '..');

	// Store job info
	const job: Job = {
		id: jobId,
		type: 'validation',
		startTime: Date.now(),
		status: 'running',
		events: []
	};
	activeJobs.set(jobId, job);
	console.log('[ValidationTrigger] Starting background validation');

	// Spawn Python process
	const pythonProcess = spawn('python3', args, {
		cwd: repoRoot,
		stdio: ['ignore', 'pipe', 'pipe']
	});

	job.process = pythonProcess;

	let stdoutBuffer = '';
	let stderrBuffer = '';
	let finalResult: any = null;

	// Parse stdout for progress events and final JSON result
	pythonProcess.stdout.on('data', (data) => {
		stdoutBuffer += data.toString();
		const lines = stdoutBuffer.split('\n');
		stdoutBuffer = lines.pop() || '';

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const parsed = JSON.parse(line);
				if (parsed.type === 'progress') {
					job.events.push(parsed);
				} else if (parsed.errors !== undefined) {
					finalResult = parsed;
				}
			} catch (e) {
				// Line is not JSON
			}
		}
	});

	pythonProcess.stderr.on('data', (data) => {
		stderrBuffer += data.toString();
	});

	// Handle process errors
	pythonProcess.on('error', (error) => {
		console.error('[ValidationTrigger] Process error:', error);
		job.status = 'error';
		job.events.push({
			type: 'error',
			message: `Failed to spawn validation process: ${error.message}`
		});
		job.endTime = Date.now();
		releaseValidationLock();
	});

	// Handle process completion
	pythonProcess.on('close', (code) => {
		if (stdoutBuffer.trim()) {
			try {
				finalResult = JSON.parse(stdoutBuffer.trim());
			} catch (e) {
				console.error('[ValidationTrigger] Failed to parse final result:', e);
			}
		}

		if (code === 0 || code === 1) {
			job.status = 'complete';
			job.result = finalResult;
			job.events.push({
				type: 'complete',
				result: finalResult
			});
			console.log('[ValidationTrigger] Background validation completed');
		} else {
			job.status = 'error';
			job.events.push({
				type: 'error',
				message: `Validation process exited with code ${code}`,
				stderr: stderrBuffer
			});
			console.error('[ValidationTrigger] Background validation failed:', stderrBuffer);
		}
		job.endTime = Date.now();

		// Release the validation lock when job completes
		releaseValidationLock();
	});

	return true;
}
