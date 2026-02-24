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

// Global operations lock - prevents any concurrent sort/validation operations
let operationLock: { holder: string; acquiredAt: number } | null = null;

const STALE_LOCK_TIMEOUT = 35 * 60 * 1000; // 35 minutes

// Helper functions for job management
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
 * Atomically try to acquire the global operation lock.
 * Returns true if lock was acquired, false if already locked.
 * Automatically recovers stale locks older than 35 minutes.
 */
export function tryAcquireOperationLock(holderId: string): boolean {
	if (operationLock) {
		// Auto-recover stale locks (older than 35 min)
		if (Date.now() - operationLock.acquiredAt > STALE_LOCK_TIMEOUT) {
			console.warn(`Auto-recovering stale operation lock held by ${operationLock.holder}`);
			operationLock = null;
		} else {
			return false;
		}
	}
	operationLock = { holder: holderId, acquiredAt: Date.now() };
	return true;
}

/**
 * Release the global operation lock.
 * Only releases if the holder matches the one who acquired it.
 */
export function releaseOperationLock(holderId: string): void {
	if (operationLock && operationLock.holder === holderId) {
		operationLock = null;
	}
}

// Keep backward-compatible aliases
export const tryAcquireValidationLock = tryAcquireOperationLock;
export const releaseValidationLock = releaseOperationLock;

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

				// Release operation lock (force release on timeout)
				operationLock = null;
			}
		}

		// If jobs exceed upper bound, remove oldest completed/errored jobs first
		const MAX_JOBS = 100;
		if (activeJobs.size > MAX_JOBS) {
			const completedJobs = [...activeJobs.entries()]
				.filter(([, job]) => job.status === 'complete' || job.status === 'error')
				.sort((a, b) => (a[1].endTime ?? a[1].startTime) - (b[1].endTime ?? b[1].startTime));

			for (const [jobId] of completedJobs) {
				if (activeJobs.size <= MAX_JOBS) break;
				activeJobs.delete(jobId);
			}
		}
	}, 60 * 1000); // Run every minute
}

// Start cleanup interval on module load
startCleanupInterval();
