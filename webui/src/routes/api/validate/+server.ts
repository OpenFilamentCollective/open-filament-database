import { json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { activeJobs, type Job, tryAcquireValidationLock, releaseValidationLock } from '$lib/server/jobManager';

export async function POST({ request }) {
	try {
		// Atomically try to acquire the validation lock to prevent race conditions
		if (!tryAcquireValidationLock()) {
			return json(
				{ error: 'A validation job is already running. Please wait for it to complete.' },
				{ status: 409 }
			);
		}

		const { type = 'full' } = await request.json();
		const jobId = 'validation-current';

		// Clean up old validation-current job if it exists and is complete
		const existingJob = activeJobs.get(jobId);
		if (existingJob && (existingJob.status === 'complete' || existingJob.status === 'error')) {
			activeJobs.delete(jobId);
		}

		// Build Python command arguments
		const args = ['-m', 'ofd', 'validate', '--json', '--progress'];

		// Add specific validation type if not full
		if (type === 'json_files') {
			args.push('--json-files');
		} else if (type === 'logo_files') {
			args.push('--logo-files');
		} else if (type === 'folder_names') {
			args.push('--folder-names');
		} else if (type === 'store_ids') {
			args.push('--store-ids');
		}

		// Determine the repo root (one level up from webui)
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

			// Keep the last incomplete line in the buffer
			stdoutBuffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const parsed = JSON.parse(line);
					if (parsed.type === 'progress') {
						job.events.push(parsed);
					} else if (parsed.errors !== undefined) {
						// This is the final result
						finalResult = parsed;
					}
				} catch (e) {
					// Line is not JSON, might be progress message
				}
			}
		});

		pythonProcess.stderr.on('data', (data) => {
			stderrBuffer += data.toString();
		});

		// Handle process errors
		pythonProcess.on('error', (error) => {
			console.error('Validation process error:', error);
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
			// Try to parse any remaining stdout as the final result
			if (stdoutBuffer.trim()) {
				try {
					finalResult = JSON.parse(stdoutBuffer.trim());
				} catch (e) {
					console.error('Failed to parse final validation result:', e);
				}
			}

			if (code === 0 || code === 1) {
				// Code 1 is expected if validation found errors
				job.status = 'complete';
				job.result = finalResult;
				job.events.push({
					type: 'complete',
					result: finalResult
				});
			} else {
				job.status = 'error';
				job.events.push({
					type: 'error',
					message: `Validation process exited with code ${code}`,
					stderr: stderrBuffer
				});
			}
			job.endTime = Date.now();

			// Release the validation lock when job completes
			releaseValidationLock();
		});

		return json({
			jobId,
			sseUrl: `/api/validate/stream/${jobId}`
		});
	} catch (error) {
		console.error('Validation endpoint error:', error);
		// Release lock on error
		releaseValidationLock();
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
