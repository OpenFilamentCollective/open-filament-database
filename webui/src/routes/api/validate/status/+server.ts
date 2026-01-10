import { json } from '@sveltejs/kit';
import { getActiveValidationJob } from '$lib/server/jobManager';

export async function GET() {
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
