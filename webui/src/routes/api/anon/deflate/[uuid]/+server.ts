/**
 * Deflate endpoint: returns the original ChangeExport for a submission
 * that has received "changes_requested" feedback, allowing the user
 * to reload their changes for editing and re-submission.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAnonBotEnabled } from '$lib/server/anonBot';
import { getSubmission } from '$lib/server/submissionStore';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ params }) => {
	if (!isAnonBotEnabled()) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	const { uuid } = params;
	if (!uuid || !UUID_REGEX.test(uuid)) {
		return json({ error: 'Invalid UUID' }, { status: 400 });
	}

	const submission = getSubmission(uuid);
	if (!submission) {
		return json({ error: 'Submission not found' }, { status: 404 });
	}

	if (submission.status !== 'changes_requested') {
		return json({ error: 'Submission is not awaiting changes' }, { status: 409 });
	}

	if (!submission.changeData) {
		return json({ error: 'No change data stored for this submission' }, { status: 404 });
	}

	try {
		const data = JSON.parse(submission.changeData);
		return json({
			uuid: submission.uuid,
			changes: data.changes,
			images: data.images
		});
	} catch {
		return json({ error: 'Stored change data is corrupt' }, { status: 500 });
	}
};
