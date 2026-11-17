/**
 * One-click "LGTM & merge" for maintainers, linked from the AI review comment
 * (`.github/workflows/ai_review.yaml`).
 *
 * Everything happens with the signed-in maintainer's own GitHub token, so the merge
 * and the thank-you comment come from them, not a bot. GitHub has no way to add a
 * custom button to a PR page, which is why this lives here.
 */

import { error, fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { getGitHubToken, getGitHubUser } from '$lib/server/auth';
import {
	MERGE_PERMISSIONS,
	createIssueComment,
	getCheckSummary,
	getPullRequestForReview,
	getRepoPermission,
	mergePullRequest
} from '$lib/server/github';
import { LGTM_MESSAGE } from '$lib/config/reviewMessages';

function upstream(): { owner: string; repo: string } {
	const owner = privateEnv.GITHUB_UPSTREAM_OWNER;
	const repo = privateEnv.GITHUB_UPSTREAM_REPO;
	if (!owner || !repo) error(500, 'GITHUB_UPSTREAM_OWNER / GITHUB_UPSTREAM_REPO are not configured');
	return { owner, repo };
}

function prNumber(param: string): number {
	const number = Number(param);
	if (!Number.isInteger(number) || number <= 0) error(404, 'Not a pull request number');
	return number;
}

/** The signed-in user and whether they may merge; sends them to log in otherwise. */
async function signedIn(cookies: Cookies, url: URL) {
	const login = `/api/auth/github/login?returnTo=${encodeURIComponent(url.pathname)}`;
	const token = getGitHubToken(cookies);
	if (!token) redirect(302, login);

	let user: { login: string };
	try {
		user = await getGitHubUser(token);
	} catch {
		// Revoked or expired token: log in again.
		redirect(302, login);
	}

	const { owner, repo } = upstream();
	const permission = await getRepoPermission(token, owner, repo, user.login);
	return { token, login: user.login, canMerge: MERGE_PERMISSIONS.has(permission) };
}

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	const number = prNumber(params.pr);
	const { token, login, canMerge } = await signedIn(cookies, url);
	if (!canMerge) {
		return { forbidden: true as const, login, number };
	}

	const { owner, repo } = upstream();
	const pr = await getPullRequestForReview(token, owner, repo, number);
	if (!pr) error(404, `Pull request #${number} not found`);
	const checks = await getCheckSummary(token, owner, repo, pr.head_sha);

	return { forbidden: false as const, login, number, pr, checks, message: LGTM_MESSAGE };
};

export const actions: Actions = {
	merge: async ({ params, cookies, url, request }) => {
		const number = prNumber(params.pr);
		const { token, canMerge } = await signedIn(cookies, url);
		if (!canMerge) return fail(403, { error: 'You need write access to the repository to merge.' });

		const form = await request.formData();
		const sha = String(form.get('sha') ?? '');
		const message = String(form.get('message') ?? '').trim() || LGTM_MESSAGE;

		const { owner, repo } = upstream();
		const pr = await getPullRequestForReview(token, owner, repo, number);
		if (!pr) return fail(404, { error: `Pull request #${number} not found.` });
		if (pr.merged) redirect(303, pr.html_url);
		if (pr.state !== 'open') return fail(409, { error: 'This pull request is closed.' });
		if (pr.draft) return fail(409, { error: 'This pull request is still a draft.' });
		if (pr.head_sha !== sha) {
			return fail(409, {
				error: 'New commits were pushed since you opened this page. Reload and review them first.'
			});
		}
		// Re-read the gates now: a sign-off can be withdrawn after the page loaded.
		const { blocking } = await getCheckSummary(token, owner, repo, sha);
		if (blocking.length > 0) {
			return fail(409, {
				error: `Not merged: ${blocking.map((b) => `${b.context} is ${b.state}`).join(', ')}.`
			});
		}

		// Merge first: it is the step that can be refused (conflicts, branch protection,
		// a push in between), and a thank-you on an unmerged PR would be misleading.
		try {
			await mergePullRequest(token, owner, repo, number, sha);
		} catch (err) {
			return fail(502, { error: err instanceof Error ? err.message : 'GitHub refused the merge.' });
		}
		try {
			await createIssueComment(token, owner, repo, number, message);
		} catch (err) {
			return fail(502, {
				error: `Merged, but the comment failed: ${err instanceof Error ? err.message : err}`
			});
		}

		redirect(303, pr.html_url);
	}
};
