/**
 * Opening a PR from the signed-in user's fork, shared by `/api/github/create-pr` and the
 * resubmission of a returned PR (`/api/submissions/[pr]/revise`).
 *
 * The branch is based on upstream `main` (not the fork's, which may be stale), the tree is
 * built in the fork, and the PR body starts with the submission UUID marker so the GitHub
 * webhook can route lifecycle events for fork PRs the same way it does for bot PRs.
 */
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
import { buildTreeItems, buildChangesSummary, explainEmptyTree } from '$lib/server/prBuilder';
import { buildUuidComment } from '$lib/server/anonBot';

export interface ForkPrInput {
	uuid: string;
	login: string;
	changes: any[];
	images?: Record<string, any>;
	title?: string;
	description?: string;
}

export type ForkPrResult =
	| {
			success: true;
			prUrl: string;
			prNumber: number;
			skippedPaths?: string[];
			noopDeletes?: string[];
	  }
	| { success: false; status: number; error: string };

/** The PR body for a fork submission. The UUID marker must stay the first line. */
export function buildForkPrBody(
	uuid: string,
	login: string,
	description: string | undefined,
	changes: any[]
): string {
	return [
		buildUuidComment(uuid),
		description || 'Submitted via Open Filament Database web editor.',
		'',
		'## Changes',
		buildChangesSummary(changes),
		'',
		`*Submitted by @${login} via the OFD web editor*`
	].join('\n');
}

export async function createForkPR(token: string, input: ForkPrInput): Promise<ForkPrResult> {
	const upstreamOwner = privateEnv.GITHUB_UPSTREAM_OWNER!;
	const upstreamRepo = privateEnv.GITHUB_UPSTREAM_REPO!;
	const { changes, images } = input;

	// Fork the repo (idempotent)
	const fork = await forkRepo(token, upstreamOwner, upstreamRepo);

	// Get latest commit SHA from UPSTREAM (not fork) so the PR branch
	// is based on a clean upstream commit without fork merge noise.
	const latestSha = await getLatestCommitSha(token, upstreamOwner, upstreamRepo, 'main');
	const baseTreeSha = await getCommitTreeSha(token, upstreamOwner, upstreamRepo, latestSha);

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
		return {
			success: false,
			status: 504,
			error: 'Could not create branch on fork. Please try again.'
		};
	}

	// Build tree items using shared logic
	const {
		treeItems,
		skippedPaths = [],
		noopDeletes = []
	} = await buildTreeItems(
		token,
		fork.owner,
		fork.repo,
		baseTreeSha,
		upstreamOwner,
		upstreamRepo,
		changes,
		images
	);

	if (treeItems.length === 0) {
		return { success: false, status: 400, error: explainEmptyTree(skippedPaths, noopDeletes) };
	}

	// Create tree with base_tree — only includes changed/deleted entries.
	// This is much smaller than sending the full repo tree (which causes 502).
	const treeSha = await createTree(token, fork.owner, fork.repo, baseTreeSha, treeItems);

	const prTitle = input.title || `Update filament database (${changes.length} changes)`;
	const commitSha = await createCommit(token, fork.owner, fork.repo, prTitle, treeSha, latestSha);

	// Update branch to point to new commit
	await updateRef(token, fork.owner, fork.repo, branchName, commitSha);

	const pr = await createPullRequest(
		token,
		upstreamOwner,
		upstreamRepo,
		`${fork.owner}:${branchName}`,
		'main',
		prTitle,
		buildForkPrBody(input.uuid, input.login, input.description, changes)
	);

	return {
		success: true,
		prUrl: pr.html_url,
		prNumber: pr.number,
		skippedPaths: skippedPaths.length > 0 ? skippedPaths : undefined,
		noopDeletes:
			noopDeletes.length > 0 ? noopDeletes.map((d) => d.description || d.path) : undefined
	};
}
