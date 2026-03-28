import { json } from '@sveltejs/kit';
import { activeJobs } from '$lib/server/jobManager';

/**
 * Fallback endpoint to retrieve a validation job's result by ID.
 * Used by the client when the SSE stream closes before the complete event
 * was processed (race condition with fast cloud validation).
 */
export async function GET({ params }) {
	const { jobId } = params;
	const job = activeJobs.get(jobId);

	if (!job) {
		return json({ error: 'Job not found' }, { status: 404 });
	}

	return json({
		status: job.status,
		result: job.result ?? null
	});
}
