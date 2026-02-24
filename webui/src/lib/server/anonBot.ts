/**
 * Anonymous bot PR creation service.
 * Creates PRs via a GitHub App installation token on behalf of anonymous users.
 * Pushes directly to the upstream repo (no forking needed).
 */
import { env as privateEnv } from '$env/dynamic/private';
import {
	getLatestCommitSha,
	getCommitTreeSha,
	createBranch,
	createTree,
	createCommit,
	updateRef,
	createPullRequest
} from '$lib/server/github';
import { getInstallationToken } from '$lib/server/githubApp';
import { buildTreeItems, buildChangesSummary } from '$lib/server/prBuilder';

// --- Types ---

export interface AnonSubmission {
	uuid: string;
	changes: any[];
	images: Record<string, any>;
	title?: string;
	description?: string;
}

export interface AnonSubmissionResult {
	success: boolean;
	uuid: string;
	prUrl?: string;
	prNumber?: number;
	error?: string;
	skippedPaths?: string[];
}

// --- Configuration ---

export function isAnonBotEnabled(): boolean {
	return privateEnv.ANON_BOT_ENABLED === 'true';
}

// --- UUID tracking in PR body ---

/** Embed UUID in PR body as HTML comment (invisible in rendered markdown) */
export function buildUuidComment(uuid: string): string {
	return `<!-- ofd-submission-uuid: ${uuid} -->`;
}

/** Extract UUID from PR body HTML comment */
export function extractUuidFromBody(body: string): string | null {
	const match = body?.match(/<!-- ofd-submission-uuid: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) -->/);
	return match?.[1] ?? null;
}

// --- PR Creation ---

export async function createAnonPR(submission: AnonSubmission): Promise<AnonSubmissionResult> {
	const token = await getInstallationToken();
	const upstreamOwner = privateEnv.GITHUB_UPSTREAM_OWNER!;
	const upstreamRepo = privateEnv.GITHUB_UPSTREAM_REPO!;

	// 1. Get latest commit from upstream
	const latestSha = await getLatestCommitSha(token, upstreamOwner, upstreamRepo, 'main');
	const baseTreeSha = await getCommitTreeSha(token, upstreamOwner, upstreamRepo, latestSha);

	// 2. Create branch directly on upstream
	const branchName = `ofd-anon-${submission.uuid}`;
	let branchCreated = false;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			await createBranch(token, upstreamOwner, upstreamRepo, branchName, latestSha);
			branchCreated = true;
			break;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}
	if (!branchCreated) {
		return { success: false, uuid: submission.uuid, error: 'Could not create branch. Please try again.' };
	}

	// 3. Build tree items directly on upstream
	const { treeItems, skippedPaths } = await buildTreeItems(
		token, upstreamOwner, upstreamRepo, baseTreeSha,
		upstreamOwner, upstreamRepo,
		submission.changes, submission.images
	);

	if (treeItems.length === 0) {
		return { success: false, uuid: submission.uuid, error: 'No valid changes to commit' };
	}

	// 4. Create tree, commit
	const treeSha = await createTree(token, upstreamOwner, upstreamRepo, baseTreeSha, treeItems);

	const prTitle = submission.title || `Update filament database (${submission.changes.length} changes)`;
	const commitSha = await createCommit(token, upstreamOwner, upstreamRepo, prTitle, treeSha, latestSha);

	// 5. Update branch ref
	await updateRef(token, upstreamOwner, upstreamRepo, branchName, commitSha);

	// 6. Build PR body with UUID comment
	const uuidComment = buildUuidComment(submission.uuid);
	const changesSummary = buildChangesSummary(submission.changes);

	const prBody = [
		uuidComment,
		submission.description || 'Submitted via Open Filament Database web editor.',
		'',
		'## Changes',
		changesSummary,
		'',
		'*Submitted anonymously via the OFD web editor*'
	].join('\n');

	// 7. Create PR (head is just branch name — no fork prefix needed)
	const pr = await createPullRequest(
		token,
		upstreamOwner,
		upstreamRepo,
		branchName,
		'main',
		prTitle,
		prBody
	);

	return {
		success: true,
		uuid: submission.uuid,
		prUrl: pr.html_url,
		prNumber: pr.number,
		skippedPaths: skippedPaths.length > 0 ? skippedPaths : undefined
	};
}
