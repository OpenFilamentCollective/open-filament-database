// Shared job storage for validation and sort operations

export interface Job {
	id: string;
	type: 'validation' | 'sort';
	startTime: number;
	status: 'running' | 'complete' | 'error';
	events: any[];
	process?: any;
	result?: any;
	endTime?: number;
}

// In-memory job storage
export const activeJobs = new Map<string, Job>();

// Lock for atomic validation job acquisition
let validationLock = false;

// Helper functions for validation job management
export function getActiveValidationJob(): Job | null {
	for (const job of activeJobs.values()) {
		if (job.type === 'validation' && job.status === 'running') {
			return job;
		}
	}
	return null;
}

export function hasActiveValidationJob(): boolean {
	return getActiveValidationJob() !== null;
}

/**
 * Atomically try to acquire the validation lock.
 * Returns true if lock was acquired, false if already locked.
 */
export function tryAcquireValidationLock(): boolean {
	if (validationLock) {
		return false;
	}
	validationLock = true;
	return true;
}

/**
 * Release the validation lock.
 */
export function releaseValidationLock(): void {
	validationLock = false;
}

// Cleanup old jobs (older than 5 minutes) and timeout stuck jobs
// Store interval ID to allow cleanup on module reload
let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Stop the cleanup interval (useful for testing or hot reload scenarios)
 */
export function stopCleanupInterval(): void {
	if (cleanupIntervalId) {
		clearInterval(cleanupIntervalId);
		cleanupIntervalId = null;
	}
}

/**
 * Start the cleanup interval if not already running
 */
function startCleanupInterval(): void {
	// Prevent multiple intervals in hot reload scenarios
	if (cleanupIntervalId) {
		return;
	}

	cleanupIntervalId = setInterval(() => {
		const now = Date.now();
		for (const [jobId, job] of activeJobs.entries()) {
			// Remove old completed/errored jobs
			if (job.endTime && now - job.endTime > 5 * 60 * 1000) {
				activeJobs.delete(jobId);
			}

			// Timeout jobs running for more than 30 minutes
			if (job.status === 'running' && now - job.startTime > 30 * 60 * 1000) {
				console.error(`Job ${jobId} timed out after 30 minutes`);
				job.status = 'error';
				job.events.push({
					type: 'error',
					message: 'Job timed out after 30 minutes'
				});
				job.endTime = now;

				// Kill the process if it exists
				if (job.process?.kill) {
					job.process.kill('SIGTERM');
				}

				// Release validation lock if this was a validation job
				if (job.type === 'validation') {
					releaseValidationLock();
				}
			}
		}
	}, 60 * 1000); // Run every minute
}

// Start cleanup interval on module load
startCleanupInterval();
