/**
 * A PR's changes rebuilt as an editor change set (see prChanges.ts), plus its feedback,
 * for loading the PR into the editor. Only for visitors who may revise it: loading is the
 * first step of revising, and rebuilding a PR costs a few dozen GitHub API calls.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadPrChanges } from '$lib/server/prChanges';
import { getPrFeedback } from '$lib/server/feedback';
import { previewFor, previewChangesResponse } from '$lib/server/devFixtures';
import {
	ContextError,
	loadSubmissionContext,
	parsePrNumber,
	publicAccess
} from '$lib/server/submissionContext';

export const GET: RequestHandler = async ({ params, cookies }) => {
	try {
		const prNumber = parsePrNumber(params.pr);
		// Development preview (/api/dev/preview/<pr>): a snapshot instead of GitHub.
		const preview = previewFor(cookies, prNumber);
		if (preview) return json(previewChangesResponse(preview));

		const ctx = await loadSubmissionContext(prNumber, cookies);
		if (!ctx.access.allowed) {
			return json(
				{ error: ctx.access.reason, access: publicAccess(ctx.access) },
				{ status: ctx.access.signIn ? 401 : 403 }
			);
		}

		const [changeSet, feedback] = await Promise.all([
			loadPrChanges(ctx.token, prNumber, ctx.pr),
			getPrFeedback(prNumber, ctx.token)
		]);
		if (!changeSet) return json({ error: `Pull request #${prNumber} not found` }, { status: 404 });

		return json({
			...changeSet,
			title: ctx.pr.title,
			url: ctx.pr.html_url,
			uuid: ctx.uuid,
			feedback: feedback?.items ?? [],
			access: publicAccess(ctx.access)
		});
	} catch (err) {
		if (err instanceof ContextError) return json({ error: err.message }, { status: err.status });
		console.error('[Submissions] loading PR changes failed:', err);
		return json(
			{ error: (err as Error).message || 'Failed to load the pull request' },
			{ status: 502 }
		);
	}
};
