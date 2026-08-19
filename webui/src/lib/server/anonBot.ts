/**
 * Anonymous bot PR creation service.
 * Creates PRs via a GitHub App installation token on behalf of anonymous users.
 * Pushes directly to the upstream repo (no forking needed).
 */
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import {
	getLatestCommitSha,
	getCommitTreeSha,
	createBranch,
	createTree,
	createCommit,
	updateRef,
	createPullRequest,
	updatePullRequest,
	getPullRequest
} from '$lib/server/github';
import { getInstallationToken } from '$lib/server/githubApp';
import { buildTreeItems, buildChangesSummary, explainEmptyTree } from '$lib/server/prBuilder';

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
	noopDeletes?: string[];
	/** True when the changes were added to an existing PR rather than opening a new one. */
	amended?: boolean;
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

// --- Shared PR body construction ---

/** The branch an anon submission owns. Stable per submission UUID, so it can be amended. */
export function anonBranchName(uuid: string): string {
	return `ofd-anon-${uuid}`;
}

/**
 * Compose the PR body. The UUID comment must come first and stay byte-identical across
 * amends — `api/webhooks/github` reads it back with `extractUuidFromBody` to route merge
 * and close events to the right submission.
 */
function buildPrBody(uuid: string, description: string | undefined, changes: any[]): string {
	const via = publicEnv.PUBLIC_WRAPPER_NAME || 'the OFD web editor';

	return [
		buildUuidComment(uuid),
		description || 'Submitted via Open Filament Database web editor.',
		'',
		'## Changes',
		buildChangesSummary(changes),
		'',
		`*Submitted via ${via}*`
	].join('\n');
}

function defaultTitle(changes: any[]): string {
	return `Update filament database (${changes.length} change${changes.length === 1 ? '' : 's'})`;
}

// --- PR Amendment ---

export interface AnonAmendment extends AnonSubmission {
	/** The open PR to add these changes to. */
	prNumber: number;
	/** Every change in the submission, earlier batches included, for the rewritten PR body. */
	allChanges: any[];
}

/**
 * Add another batch of changes to a submission that is still in review.
 *
 * Contributors routinely finish one batch, submit, then keep editing — #459/#460/#461 opened
 * three PRs on the same 3dhojor paths within 13 minutes, which merged out of order, needed
 * hand-resolved conflicts, and left an orphan filament in `main`. Stacking the second batch
 * onto the same branch keeps it one review and one merge.
 *
 * The tree is built from the **branch head**, not `main`, so the new batch sees the first
 * batch's files: `buildTreeItems` resolves cascade-deletes and carries canonical `uuid` /
 * `moved_from` fields out of whatever tree it is given.
 *
 * Returns `success: false` with `retryAsNew` when the PR is no longer amendable (merged,
 * closed, or its branch deleted), so the caller can fall back to opening a new PR.
 */
export async function amendAnonPR(
	amendment: AnonAmendment
): Promise<AnonSubmissionResult & { retryAsNew?: boolean }> {
	const token = await getInstallationToken();
	const upstreamOwner = privateEnv.GITHUB_UPSTREAM_OWNER!;
	const upstreamRepo = privateEnv.GITHUB_UPSTREAM_REPO!;
	const branchName = anonBranchName(amendment.uuid);

	// 1. The PR must still be open. Re-checked here rather than trusting the caller's cache,
	//    because a maintainer may have merged it between the client's last poll and this call.
	const pr = await getPullRequest(token, upstreamOwner, upstreamRepo, amendment.prNumber);
	if (!pr || pr.merged || pr.state !== 'open') {
		return {
			success: false,
			uuid: amendment.uuid,
			retryAsNew: true,
			error: 'That submission is no longer open.'
		};
	}

	// 2. Resolve the branch head. A missing ref means the branch was deleted out from under
	//    the PR; there is nothing to stack onto.
	let headSha: string;
	let baseTreeSha: string;
	try {
		headSha = await getLatestCommitSha(token, upstreamOwner, upstreamRepo, branchName);
		baseTreeSha = await getCommitTreeSha(token, upstreamOwner, upstreamRepo, headSha);
	} catch {
		return {
			success: false,
			uuid: amendment.uuid,
			retryAsNew: true,
			error: 'That submission’s branch no longer exists.'
		};
	}

	// 3. Build the new batch against the branch's own tree.
	const { treeItems, skippedPaths = [], noopDeletes = [] } = await buildTreeItems(
		token, upstreamOwner, upstreamRepo, baseTreeSha,
		upstreamOwner, upstreamRepo,
		amendment.changes, amendment.images
	);

	if (treeItems.length === 0) {
		return {
			success: false,
			uuid: amendment.uuid,
			error: explainEmptyTree(skippedPaths, noopDeletes)
		};
	}

	// 4. Commit onto the branch head.
	const treeSha = await createTree(token, upstreamOwner, upstreamRepo, baseTreeSha, treeItems);
	const commitMessage =
		amendment.title || defaultTitle(amendment.changes);
	const commitSha = await createCommit(
		token, upstreamOwner, upstreamRepo, commitMessage, treeSha, headSha
	);
	await updateRef(token, upstreamOwner, upstreamRepo, branchName, commitSha);

	// 5. Rewrite the PR body so `## Changes` covers every batch. The title is only widened
	//    when the caller supplies one — a stale title is less confusing than a wrong one.
	const updated = await updatePullRequest(token, upstreamOwner, upstreamRepo, amendment.prNumber, {
		title: amendment.title,
		body: buildPrBody(amendment.uuid, amendment.description, amendment.allChanges)
	});

	return {
		success: true,
		uuid: amendment.uuid,
		prUrl: updated.html_url,
		prNumber: updated.number,
		amended: true,
		skippedPaths: skippedPaths.length > 0 ? skippedPaths : undefined,
		noopDeletes: noopDeletes.length > 0 ? noopDeletes.map((d) => d.description || d.path) : undefined
	};
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
	const branchName = anonBranchName(submission.uuid);
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
	const { treeItems, skippedPaths = [], noopDeletes = [] } = await buildTreeItems(
		token, upstreamOwner, upstreamRepo, baseTreeSha,
		upstreamOwner, upstreamRepo,
		submission.changes, submission.images
	);

	if (treeItems.length === 0) {
		return { success: false, uuid: submission.uuid, error: explainEmptyTree(skippedPaths, noopDeletes) };
	}

	// 4. Create tree, commit
	const treeSha = await createTree(token, upstreamOwner, upstreamRepo, baseTreeSha, treeItems);

	const prTitle = submission.title || defaultTitle(submission.changes);
	const commitSha = await createCommit(token, upstreamOwner, upstreamRepo, prTitle, treeSha, latestSha);

	// 5. Update branch ref
	await updateRef(token, upstreamOwner, upstreamRepo, branchName, commitSha);

	// 6. Build PR body with UUID comment
	const prBody = buildPrBody(submission.uuid, submission.description, submission.changes);

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
		skippedPaths: skippedPaths.length > 0 ? skippedPaths : undefined,
		noopDeletes: noopDeletes.length > 0 ? noopDeletes.map((d) => d.description || d.path) : undefined
	};
}
