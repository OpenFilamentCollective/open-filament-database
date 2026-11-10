import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'crypto';
import { getGitHubToken, getGitHubUser } from '$lib/server/auth';
import { env as privateEnv } from '$env/dynamic/private';
import { createForkPR } from '$lib/server/forkPr';
import { trackSubmission } from '$lib/server/submissionStore';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = getGitHubToken(cookies);
	if (!token) {
		return json({ error: 'Not authenticated. Please login to GitHub first.' }, { status: 401 });
	}

	if (!privateEnv.GITHUB_UPSTREAM_OWNER || !privateEnv.GITHUB_UPSTREAM_REPO) {
		return json({ error: 'GitHub upstream repository not configured' }, { status: 500 });
	}

	try {
		const { changes, images, title, description } = await request.json();

		if (!changes || !Array.isArray(changes) || changes.length === 0) {
			return json({ error: 'No changes to submit' }, { status: 400 });
		}

		// Get authenticated user
		const user = await getGitHubUser(token);

		// The submission UUID goes in the PR body, like a bot PR's, so the GitHub webhook can
		// route this PR's lifecycle (feedback, returned, rejected) to the same record.
		const uuid = crypto.randomUUID();
		const result = await createForkPR(token, {
			uuid,
			login: user.login,
			changes,
			images,
			title,
			description
		});

		if (!result.success) {
			return json({ error: result.error }, { status: result.status });
		}

		trackSubmission(uuid, result.prNumber, result.prUrl, JSON.stringify({ changes, images: images || {} }));

		return json({
			success: true,
			uuid,
			prUrl: result.prUrl,
			prNumber: result.prNumber,
			skippedPaths: result.skippedPaths,
			noopDeletes: result.noopDeletes
		});
	} catch (error: any) {
		console.error('PR creation error:', error);
		return json({ error: error.message || 'Failed to create PR' }, { status: 500 });
	}
};
