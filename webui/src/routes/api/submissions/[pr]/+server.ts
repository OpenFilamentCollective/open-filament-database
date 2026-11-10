/**
 * A submission's status and review feedback, for the `/submissions/[pr]` page and the
 * editor's feedback banners. Public: the PR is public on GitHub. The visitor's own
 * permission to revise it is included, but never the submitter's identity.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrFeedback } from '$lib/server/feedback';
import { previewFor, previewFeedbackResponse } from '$lib/server/devFixtures';
import {
	ContextError,
	loadSubmissionContext,
	parsePrNumber,
	publicAccess,
	submissionStatus
} from '$lib/server/submissionContext';

export const GET: RequestHandler = async ({ params, cookies }) => {
	try {
		const prNumber = parsePrNumber(params.pr);
		// Development preview (/api/dev/preview/<pr>): a snapshot instead of GitHub.
		const preview = previewFor(cookies, prNumber);
		if (preview) return json(previewFeedbackResponse(preview));

		const ctx = await loadSubmissionContext(prNumber, cookies);
		const feedback = await getPrFeedback(prNumber, ctx.token);
		if (!feedback) return json({ error: `Pull request #${prNumber} not found` }, { status: 404 });

		return json({
			pr: feedback.pr,
			status: submissionStatus(ctx.pr, ctx.outcome, feedback.items.length),
			outcome: ctx.outcome
				? {
						outcome: ctx.outcome.outcome,
						reason: ctx.outcome.reason,
						supersededBy: ctx.outcome.supersededBy,
						closedAt: ctx.pr.closed_at
					}
				: null,
			items: feedback.items,
			truncated: feedback.truncated,
			access: publicAccess(ctx.access)
		});
	} catch (err) {
		if (err instanceof ContextError) return json({ error: err.message }, { status: err.status });
		console.error('[Submissions] feedback lookup failed:', err);
		return json({ error: (err as Error).message || 'Failed to load feedback' }, { status: 502 });
	}
};
