/**
 * Check the status of an anonymous submission by UUID.
 * Returns only safe data (UUID, status, PR URL — never email).
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

	return json({
		uuid: submission.uuid,
		status: submission.status,
		prUrl: submission.prUrl,
		prNumber: submission.prNumber,
		createdAt: submission.createdAt
	});
};
