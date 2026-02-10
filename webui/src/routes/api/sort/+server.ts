import { json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { activeJobs, type Job, tryAcquireOperationLock, releaseOperationLock } from '$lib/server/jobManager';

export async function POST({ request }) {
	try {
		// Atomically try to acquire the operation lock to prevent concurrent operations
		if (!tryAcquireOperationLock()) {
			return json(
				{ error: 'An operation is already running. Please wait for it to complete.' },
				{ status: 409 }
			);
		}

		const { dryRun = false, runValidation = false } = await request.json();
		const jobId = randomUUID();

		// Build Python command arguments
		const args = ['-m', 'ofd', 'script', 'style_data', '--json', '--progress'];

		if (dryRun) {
			args.push('--dry-run');
		}

		if (runValidation) {
			args.push('--validate');
		}

		// Determine the repo root (one level up from webui)
		const repoRoot = path.resolve(process.cwd(), '..');

		// Store job info
		const job: Job = {
			id: jobId,
			type: 'sort',
			startTime: Date.now(),
			status: 'running',
			events: []
		};
		activeJobs.set(jobId, job);
		console.log(`[Sort] Created job ${jobId}, activeJobs size: ${activeJobs.size}`);

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
					} else if (parsed.stats !== undefined) {
						// This is the final result
						finalResult = parsed;
					} else if (parsed.errors !== undefined) {
						// Validation result included with sort
						if (!finalResult) finalResult = {};
						finalResult.validation = parsed;
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
			console.error('Sort process error:', error);
			job.status = 'error';
			job.events.push({
				type: 'error',
				message: `Failed to spawn sort process: ${error.message}`
			});
			job.endTime = Date.now();
			releaseOperationLock();
		});

		// Handle process completion
		pythonProcess.on('close', (code) => {
			// Try to parse any remaining stdout as the final result
			if (stdoutBuffer.trim()) {
				try {
					const remaining = JSON.parse(stdoutBuffer.trim());
					if (remaining.stats !== undefined) {
						finalResult = remaining;
					} else if (remaining.errors !== undefined) {
						if (!finalResult) finalResult = {};
						finalResult.validation = remaining;
					} else {
						finalResult = remaining;
					}
				} catch (e) {
					console.error('Failed to parse final sort result:', e);
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
					message: `Sort process exited with code ${code}`,
					stderr: stderrBuffer
				});
			}
			job.endTime = Date.now();

			// Release the operation lock when job completes
			releaseOperationLock();
		});

		return json({
			jobId,
			sseUrl: `/api/sort/stream/${jobId}`
		});
	} catch (error) {
		console.error('Sort endpoint error:', error);
		// Release lock on error
		releaseOperationLock();
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
