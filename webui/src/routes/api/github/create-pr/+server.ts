import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitHubToken, getGitHubUser } from '$lib/server/auth';
import { env as privateEnv } from '$env/dynamic/private';
import {
	forkRepo,
	getLatestCommitSha,
	getCommitTreeSha,
	createBranch,
	createTree,
	createCommit,
	updateRef,
	createPullRequest
} from '$lib/server/github';
import { buildTreeItems, buildChangesSummary } from '$lib/server/prBuilder';

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

		// Fork the repo (idempotent)
		const fork = await forkRepo(token, privateEnv.GITHUB_UPSTREAM_OWNER, privateEnv.GITHUB_UPSTREAM_REPO);

		// Get latest commit SHA from UPSTREAM (not fork) so the PR branch
		// is based on a clean upstream commit without fork merge noise.
		const latestSha = await getLatestCommitSha(token, privateEnv.GITHUB_UPSTREAM_OWNER, privateEnv.GITHUB_UPSTREAM_REPO, 'main');
		const baseTreeSha = await getCommitTreeSha(token, privateEnv.GITHUB_UPSTREAM_OWNER, privateEnv.GITHUB_UPSTREAM_REPO, latestSha);

		// Create branch on fork
		const branchName = `ofd-changes-${Date.now()}`;
		let branchCreated = false;
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				await createBranch(token, fork.owner, fork.repo, branchName, latestSha);
				branchCreated = true;
				break;
			} catch {
				// New fork may need a moment before it can accept refs
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}
		if (!branchCreated) {
			return json({ error: 'Could not create branch on fork. Please try again.' }, { status: 504 });
		}

		// Build tree items using shared logic
		const { treeItems, skippedPaths } = await buildTreeItems(
			token, fork.owner, fork.repo, baseTreeSha,
			privateEnv.GITHUB_UPSTREAM_OWNER, privateEnv.GITHUB_UPSTREAM_REPO,
			changes, images
		);

		if (treeItems.length === 0) {
			return json({ error: 'No valid changes to commit' }, { status: 400 });
		}

		// Create tree with base_tree — only includes changed/deleted entries.
		// This is much smaller than sending the full repo tree (which causes 502).
		const treeSha = await createTree(token, fork.owner, fork.repo, baseTreeSha, treeItems);

		// Create commit
		const prTitle = title || `Update filament database (${changes.length} changes)`;
		const commitMessage = prTitle;
		const commitSha = await createCommit(
			token,
			fork.owner,
			fork.repo,
			commitMessage,
			treeSha,
			latestSha
		);

		// Update branch to point to new commit
		await updateRef(token, fork.owner, fork.repo, branchName, commitSha);

		// Build PR body
		const changesSummary = buildChangesSummary(changes);

		const prBody = [
			description || 'Submitted via Open Filament Database web editor.',
			'',
			'## Changes',
			changesSummary,
			'',
			`*Submitted by @${user.login} via the OFD web editor*`
		].join('\n');

		// Create PR
		const pr = await createPullRequest(
			token,
			privateEnv.GITHUB_UPSTREAM_OWNER,
			privateEnv.GITHUB_UPSTREAM_REPO,
			`${fork.owner}:${branchName}`,
			'main',
			prTitle,
			prBody
		);

		return json({
			success: true,
			prUrl: pr.html_url,
			prNumber: pr.number,
			skippedPaths: skippedPaths.length > 0 ? skippedPaths : undefined
		});
	} catch (error: any) {
		console.error('PR creation error:', error);
		return json({ error: error.message || 'Failed to create PR' }, { status: 500 });
	}
};
