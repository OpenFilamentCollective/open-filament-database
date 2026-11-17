import { json } from '@sveltejs/kit';
import { activeJobs, getActiveValidationJob } from '$lib/server/jobManager';
import { IS_CLOUD } from '$lib/server/cloudProxy';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET({ url }) {
	if (IS_CLOUD) {
		// Cloud mode: check for a session-specific job
		const sessionId = url.searchParams.get('sessionId');
		if (!sessionId || !UUID_REGEX.test(sessionId)) {
			return json({ running: false });
		}

		const job = activeJobs.get(`validation-${sessionId}`);
		if (!job || job.status !== 'running') {
			return json({ running: false });
		}

		return json({
			running: true,
			jobId: job.id,
			startTime: job.startTime,
			status: job.status
		});
	}

	// Local mode: check the singleton validation job
	const job = getActiveValidationJob();

	if (!job) {
		return json({ running: false });
	}

	return json({
		running: true,
		jobId: job.id,
		startTime: job.startTime,
		status: job.status
	});
}
