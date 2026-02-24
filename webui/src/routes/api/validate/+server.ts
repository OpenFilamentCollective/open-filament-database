import { json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { activeJobs, type Job, tryAcquireValidationLock, releaseValidationLock } from '$lib/server/jobManager';
import { IS_CLOUD } from '$lib/server/cloudProxy';
import { runCloudValidation } from '$lib/server/cloudValidator';

const ALLOWED_TYPES = new Set(['full', 'json_files', 'logo_files', 'folder_names', 'store_ids']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST({ request }) {
	// Parse JSON before acquiring lock to avoid holding lock on bad input
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON in request body' }, { status: 400 });
	}
	const { type = 'full', changes, images, sessionId } = body;

	// Validate type parameter
	if (!ALLOWED_TYPES.has(type)) {
		return json({ error: `Invalid validation type: '${type}'` }, { status: 400 });
	}

	if (IS_CLOUD) {
		return handleCloudValidation(changes, images, sessionId);
	} else {
		return handleLocalValidation(type, changes, images);
	}
}

// --- Cloud mode: in-process ajv validation with per-session jobs ---

function handleCloudValidation(
	changes: any,
	images: any,
	sessionId: string | undefined
): Response {
	// Validate sessionId format (must be a UUID from the client)
	if (!sessionId || typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
		return json({ error: 'Missing or invalid sessionId (expected UUID)' }, { status: 400 });
	}

	const jobId = `validation-${sessionId}`;

	// If this session already has a running job, return conflict
	const existingJob = activeJobs.get(jobId);
	if (existingJob && existingJob.status === 'running') {
		return json(
			{ error: 'A validation job is already running for this session.' },
			{ status: 409 }
		);
	}

	// Clean up old job for this session
	if (existingJob) {
		activeJobs.delete(jobId);
	}

	const job: Job = {
		id: jobId,
		type: 'validation',
		startTime: Date.now(),
		status: 'running',
		events: []
	};
	activeJobs.set(jobId, job);

	// Run validation asynchronously (not awaited — events stream via SSE)
	runCloudValidation(job, changes || [], images || {}).catch((err) => {
		console.error('Cloud validation unexpected error:', err);
		if (job.status === 'running') {
			job.status = 'error';
			job.events.push({ type: 'error', message: 'Unexpected validation error' });
			job.endTime = Date.now();
		}
	});

	return json({
		jobId,
		sseUrl: `/api/validate/stream/${jobId}`
	});
}

// --- Local mode: Python subprocess with global lock ---

function handleLocalValidation(type: string, changes: any, images: any): Response {
	try {
		// Atomically try to acquire the validation lock to prevent race conditions
		if (!tryAcquireValidationLock('validation-current')) {
			return json(
				{ error: 'A validation job is already running. Please wait for it to complete.' },
				{ status: 409 }
			);
		}
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

		// If changes are provided, pipe them via stdin instead of writing a temp file
		const hasChanges = changes && Array.isArray(changes) && changes.length > 0;
		let changesPayload: string | null = null;
		if (hasChanges) {
			changesPayload = JSON.stringify({ changes, images: images || {} });
			args.push('--apply-changes', '-');
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

		// Spawn Python process — use 'pipe' for stdin when we have changes to send
		const pythonProcess = spawn('python3', args, {
			cwd: repoRoot,
			stdio: [changesPayload ? 'pipe' : 'ignore', 'pipe', 'pipe']
		});

		job.process = pythonProcess;

		// Write changes to stdin if available, then close it
		if (changesPayload && pythonProcess.stdin) {
			pythonProcess.stdin.write(changesPayload);
			pythonProcess.stdin.end();
		}

		let stdoutBuffer = '';
		let stderrBuffer = '';
		let finalResult: any = null;

		// Parse stdout for progress events and final JSON result
		pythonProcess.stdout!.on('data', (data) => {
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

		pythonProcess.stderr!.on('data', (data) => {
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
			releaseValidationLock('validation-current');
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
			releaseValidationLock('validation-current');
		});

		return json({
			jobId,
			sseUrl: `/api/validate/stream/${jobId}`
		});
	} catch (error) {
		console.error('Validation endpoint error:', error);
		// Release lock on error
		releaseValidationLock('validation-current');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
