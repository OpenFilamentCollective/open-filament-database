/**
 * GitHub REST API helper using raw fetch (no external dependencies)
 * Used for fork + branch + commit + PR creation workflow
 */

const API_BASE = 'https://api.github.com';

function headers(token: string) {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json'
	};
}

async function ghFetch(token: string, path: string, options?: RequestInit) {
	const response = await fetch(`${API_BASE}${path}`, {
		...options,
		headers: { ...headers(token), ...options?.headers }
	});
	return response;
}

async function ghError(response: Response, prefix: string): Promise<Error> {
	try {
		const body = await response.json();
		const msg = body.message || JSON.stringify(body);
		const errors = body.errors ? ` [${JSON.stringify(body.errors)}]` : '';
		return new Error(`${prefix}: ${response.status} - ${msg}${errors}`);
	} catch {
		return new Error(`${prefix}: ${response.status}`);
	}
}

/**
 * Fork a repository. Idempotent - returns existing fork if already forked.
 */
export async function forkRepo(
	token: string,
	owner: string,
	repo: string
): Promise<{ owner: string; repo: string; full_name: string }> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/forks`, {
		method: 'POST',
		body: JSON.stringify({})
	});

	if (!response.ok && response.status !== 202) {
		const error = await response.json();
		throw new Error(`Failed to fork repo: ${error.message}`);
	}

	const fork = await response.json();
	return {
		owner: fork.owner.login,
		repo: fork.name,
		full_name: fork.full_name
	};
}

/**
 * Sync a fork's default branch with its upstream.
 */
export async function syncFork(
	token: string,
	owner: string,
	repo: string,
	branch: string = 'main'
): Promise<void> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/merge-upstream`, {
		method: 'POST',
		body: JSON.stringify({ branch })
	});

	// 200 = updated, 409 = already up to date — both are fine
	if (!response.ok && response.status !== 409) {
		const error = await response.json().catch(() => ({ message: response.statusText }));
		throw new Error(`Failed to sync fork: ${error.message}`);
	}
}

/**
 * Get the latest commit SHA on a branch
 */
export async function getLatestCommitSha(
	token: string,
	owner: string,
	repo: string,
	branch: string = 'main'
): Promise<string> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);

	if (!response.ok) {
		throw await ghError(response, 'Failed to get branch ref');
	}

	const ref = await response.json();
	return ref.object.sha;
}

/**
 * Create a new branch on a repository
 */
export async function createBranch(
	token: string,
	owner: string,
	repo: string,
	branchName: string,
	fromSha: string
): Promise<void> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
		method: 'POST',
		body: JSON.stringify({
			ref: `refs/heads/${branchName}`,
			sha: fromSha
		})
	});

	if (!response.ok) {
		const error = await response.json();
		// Branch might already exist
		if (error.message?.includes('Reference already exists')) {
			return;
		}
		throw new Error(`Failed to create branch: ${error.message}`);
	}
}

/**
 * Create a blob (file content) in the repository
 */
export async function createBlob(
	token: string,
	owner: string,
	repo: string,
	content: string,
	encoding: 'utf-8' | 'base64' = 'utf-8'
): Promise<string> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
		method: 'POST',
		body: JSON.stringify({ content, encoding })
	});

	if (!response.ok) {
		throw await ghError(response, 'Failed to create blob');
	}

	const blob = await response.json();
	return blob.sha;
}

/**
 * Get the full recursive tree for a given tree SHA.
 * Returns a map of path → { sha, mode, type }.
 */
export async function getRecursiveTree(
	token: string,
	owner: string,
	repo: string,
	treeSha: string
): Promise<Map<string, { sha: string; mode: string; type: string }>> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`);

	if (!response.ok) {
		throw await ghError(response, 'Failed to get recursive tree');
	}

	const data = await response.json();
	const map = new Map<string, { sha: string; mode: string; type: string }>();
	for (const entry of data.tree) {
		if (entry.type === 'blob') {
			map.set(entry.path, { sha: entry.sha, mode: entry.mode, type: entry.type });
		}
	}
	return map;
}

/**
 * Read a blob's contents as text. Returns null when the blob is gone (404) or
 * too large for the API to inline (GitHub omits the content past ~100 MB).
 */
export async function getBlobText(
	token: string,
	owner: string,
	repo: string,
	sha: string
): Promise<string | null> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs/${sha}`);

	if (response.status === 404) return null;
	if (!response.ok) {
		throw await ghError(response, 'Failed to get blob');
	}

	const blob = await response.json();
	if (typeof blob.content !== 'string') return null;
	if (blob.encoding === 'base64') return Buffer.from(blob.content, 'base64').toString('utf-8');
	if (blob.encoding === 'utf-8') return blob.content;
	return null;
}

/**
 * Create a tree (directory listing) in the repository.
 * If baseTreeSha is provided, creates an incremental tree.
 * If null, creates a full tree from scratch (all entries must be provided).
 */
export async function createTree(
	token: string,
	owner: string,
	repo: string,
	baseTreeSha: string | null,
	items: Array<{ path: string; sha: string | null; mode?: string; type?: string }>
): Promise<string> {
	let tree;
	if (baseTreeSha) {
		// Incremental mode: include null SHAs to delete files from base_tree
		tree = items.map((item) => ({
			path: item.path,
			mode: item.mode || '100644',
			type: item.type || 'blob',
			sha: item.sha
		}));
	} else {
		// Full tree mode: exclude null SHAs (no base to delete from)
		tree = items
			.filter((item) => item.sha !== null)
			.map((item) => ({
				path: item.path,
				mode: item.mode || '100644',
				type: item.type || 'blob',
				sha: item.sha
			}));
	}

	const body: any = { tree };
	if (baseTreeSha) {
		body.base_tree = baseTreeSha;
	}

	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/trees`, {
		method: 'POST',
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		throw await ghError(response, 'Failed to create tree');
	}

	const result = await response.json();
	return result.sha;
}

/**
 * Create a commit
 */
export async function createCommit(
	token: string,
	owner: string,
	repo: string,
	message: string,
	treeSha: string,
	/** One parent for a normal commit; two (`[branchHead, mainHead]`) for a merge commit. */
	parentSha: string | string[]
): Promise<string> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/commits`, {
		method: 'POST',
		body: JSON.stringify({
			message,
			tree: treeSha,
			parents: Array.isArray(parentSha) ? parentSha : [parentSha]
		})
	});

	if (!response.ok) {
		throw await ghError(response, 'Failed to create commit');
	}

	const commit = await response.json();
	return commit.sha;
}

/**
 * Update a branch reference to point to a new commit
 */
export async function updateRef(
	token: string,
	owner: string,
	repo: string,
	branch: string,
	commitSha: string
): Promise<void> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
		method: 'PATCH',
		body: JSON.stringify({ sha: commitSha })
	});

	if (!response.ok) {
		throw await ghError(response, 'Failed to update ref');
	}
}

/**
 * Create a pull request
 */
export async function createPullRequest(
	token: string,
	upstreamOwner: string,
	upstreamRepo: string,
	head: string, // e.g., "username:branch-name"
	base: string, // e.g., "main"
	title: string,
	body: string
): Promise<{ number: number; html_url: string }> {
	const response = await ghFetch(token, `/repos/${upstreamOwner}/${upstreamRepo}/pulls`, {
		method: 'POST',
		body: JSON.stringify({ title, body, head, base })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(`Failed to create PR: ${error.message}`);
	}

	const pr = await response.json();
	return { number: pr.number, html_url: pr.html_url };
}

/**
 * Update an existing pull request's title and/or body.
 *
 * Used when a contributor adds a second batch of changes to a submission that is still in
 * review: the new commit goes on the same branch, and the PR body's `## Changes` list is
 * rewritten to cover everything. See `amendAnonPR` in `anonBot.ts`.
 */
export async function updatePullRequest(
	token: string,
	owner: string,
	repo: string,
	prNumber: number,
	fields: { title?: string; body?: string }
): Promise<{ number: number; html_url: string }> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/pulls/${prNumber}`, {
		method: 'PATCH',
		body: JSON.stringify(fields)
	});

	if (!response.ok) throw await ghError(response, 'Failed to update PR');

	const pr = await response.json();
	return { number: pr.number, html_url: pr.html_url };
}

/**
 * Get a pull request's current state from GitHub.
 * `token` is optional — the upstream repo is public, so an unauthenticated
 * request works (subject to a lower rate limit); pass an installation/user
 * token when available to raise the limit. Returns null if the PR is not found.
 */
export async function getPullRequest(
	token: string | null,
	owner: string,
	repo: string,
	prNumber: number
): Promise<{
	number: number;
	state: 'open' | 'closed';
	merged: boolean;
	/** ISO timestamp of the merge, or null when the PR is not merged. */
	merged_at: string | null;
	html_url: string;
	/** Head branch name, so callers can tell an amendable branch from a deleted one. */
	head_ref: string | null;
} | null> {
	const path = `/repos/${owner}/${repo}/pulls/${prNumber}`;
	const response = token
		? await ghFetch(token, path)
		: await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/vnd.github+json' } });

	if (response.status === 404) return null;
	if (!response.ok) throw await ghError(response, 'Failed to get PR');

	const pr = await response.json();
	return {
		number: pr.number,
		state: pr.state,
		merged: pr.merged === true,
		merged_at: pr.merged_at ?? null,
		html_url: pr.html_url,
		head_ref: pr.head?.ref ?? null
	};
}

/**
 * Delete a branch reference
 */
export async function deleteBranch(
	token: string,
	owner: string,
	repo: string,
	branch: string
): Promise<void> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
		method: 'DELETE'
	});
	// 422 = already deleted, 404 = doesn't exist — both are fine
	if (!response.ok && response.status !== 422 && response.status !== 404) {
		throw await ghError(response, 'Failed to delete branch');
	}
}

/**
 * Get the base tree SHA for a commit
 */
export async function getCommitTreeSha(
	token: string,
	owner: string,
	repo: string,
	commitSha: string
): Promise<string> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/commits/${commitSha}`);

	if (!response.ok) {
		throw await ghError(response, 'Failed to get commit');
	}

	const commit = await response.json();
	return commit.tree.sha;
}

// --- Maintainer review & merge (src/routes/review/merge/[pr]) ---

/**
 * A user's permission on a repository: `admin`, `maintain`, `write`, `triage`, `read`
 * or `none`. Only the first three may merge.
 */
export async function getRepoPermission(
	token: string,
	owner: string,
	repo: string,
	username: string
): Promise<string> {
	const response = await ghFetch(
		token,
		`/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}/permission`
	);
	// 404/403: not a collaborator, or the token can't see collaborators at all.
	if (response.status === 404 || response.status === 403) return 'none';
	if (!response.ok) throw await ghError(response, 'Failed to get repository permission');
	const body = await response.json();
	return body.role_name ?? body.permission ?? 'none';
}

export const MERGE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);

export interface PullRequestForReview {
	number: number;
	title: string;
	html_url: string;
	state: 'open' | 'closed';
	merged: boolean;
	draft: boolean;
	author: string;
	head_sha: string;
	/** null while GitHub is still computing it. */
	mergeable: boolean | null;
	mergeable_state: string;
	changed_files: number;
	additions: number;
	deletions: number;
}

/** Everything the merge page shows about a PR. Returns null if it does not exist. */
export async function getPullRequestForReview(
	token: string,
	owner: string,
	repo: string,
	prNumber: number
): Promise<PullRequestForReview | null> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/pulls/${prNumber}`);
	if (response.status === 404) return null;
	if (!response.ok) throw await ghError(response, 'Failed to get PR');
	const pr = await response.json();
	return {
		number: pr.number,
		title: pr.title,
		html_url: pr.html_url,
		state: pr.state,
		merged: pr.merged === true,
		draft: pr.draft === true,
		author: pr.user?.login ?? 'unknown',
		head_sha: pr.head.sha,
		mergeable: pr.mergeable ?? null,
		mergeable_state: pr.mergeable_state ?? 'unknown',
		changed_files: pr.changed_files ?? 0,
		additions: pr.additions ?? 0,
		deletions: pr.deletions ?? 0
	};
}

/**
 * Commit statuses that must be green before the merge page will merge, whatever branch
 * protection says: the brand representative's sign-off (`brand_signoff.yaml`, #808)
 * and the sustainability source check (`ai_review.yaml`, #768). Each workflow turns
 * its own status green when a maintainer applies its override label, so there is no
 * bypass here. Both post a status on every PR, so a missing one means the workflow
 * hasn't run or crashed, and blocks too: fail closed. For a PR opened before a gate
 * existed, run that workflow by hand.
 */
export const MERGE_GATES = ['Brand sign-off', 'Sustainability sources'];

export interface CheckSummary {
	passed: number;
	failed: string[];
	pending: string[];
	/** Merge gates (see {@link MERGE_GATES}) that are not green or missing, with why. */
	blocking: Array<{ context: string; state: string; description: string; url: string | null }>;
}

/**
 * Check runs and commit statuses on a commit, bucketed so the page can warn before
 * merging on red. Statuses matter: the merge gates are statuses, not check runs.
 */
export async function getCheckSummary(
	token: string,
	owner: string,
	repo: string,
	sha: string
): Promise<CheckSummary> {
	const [runsResponse, statusResponse] = await Promise.all([
		ghFetch(token, `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`),
		ghFetch(token, `/repos/${owner}/${repo}/commits/${sha}/status?per_page=100`)
	]);
	if (!runsResponse.ok) throw await ghError(runsResponse, 'Failed to get checks');
	if (!statusResponse.ok) throw await ghError(statusResponse, 'Failed to get statuses');
	const runs = await runsResponse.json();
	const combined = await statusResponse.json();

	const summary: CheckSummary = { passed: 0, failed: [], pending: [], blocking: [] };
	for (const run of runs.check_runs ?? []) {
		if (run.status !== 'completed') summary.pending.push(run.name);
		else if (['success', 'neutral', 'skipped'].includes(run.conclusion)) summary.passed++;
		else summary.failed.push(run.name);
	}
	// The combined endpoint already keeps only the latest status per context.
	for (const status of combined.statuses ?? []) {
		if (status.state === 'success') summary.passed++;
		else if (status.state === 'pending') summary.pending.push(status.context);
		else summary.failed.push(status.context);
		if (MERGE_GATES.includes(status.context) && status.state !== 'success') {
			summary.blocking.push({
				context: status.context,
				state: status.state,
				description: status.description ?? '',
				url: status.target_url ?? null
			});
		}
	}
	const posted = new Set((combined.statuses ?? []).map((s: { context: string }) => s.context));
	for (const context of MERGE_GATES) {
		if (!posted.has(context)) {
			summary.blocking.push({
				context,
				state: 'missing',
				description: 'not reported on this commit; run its workflow',
				url: null
			});
		}
	}
	return summary;
}

/** Post a comment on an issue or PR, as whoever owns `token`. */
export async function createIssueComment(
	token: string,
	owner: string,
	repo: string,
	issueNumber: number,
	body: string
): Promise<void> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
		method: 'POST',
		body: JSON.stringify({ body })
	});
	if (!response.ok) throw await ghError(response, 'Failed to comment');
}

/**
 * Merge a PR with a merge commit, the repo's convention.
 *
 * `sha` pins the merge to the head the maintainer looked at: if anything was pushed
 * since, GitHub refuses with 409 instead of merging unreviewed commits.
 */
export async function mergePullRequest(
	token: string,
	owner: string,
	repo: string,
	prNumber: number,
	sha: string
): Promise<void> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
		method: 'PUT',
		body: JSON.stringify({ sha, merge_method: 'merge' })
	});
	if (!response.ok) throw await ghError(response, 'Failed to merge');
}

// --- Feedback & revisions (src/lib/server/feedback.ts, prChanges.ts, revision.ts) ---

/** GET that works without a token: the upstream repo is public. */
async function ghGet(token: string | null, path: string): Promise<Response> {
	return token
		? ghFetch(token, path)
		: fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/vnd.github+json' } });
}

/**
 * Run a GraphQL query. GitHub's GraphQL API always needs a token, unlike REST on a public
 * repo. Throws on transport errors and on a response carrying `errors`.
 */
export async function githubGraphQL<T = any>(
	token: string,
	query: string,
	variables: Record<string, unknown>
): Promise<T> {
	const response = await ghFetch(token, '/graphql', {
		method: 'POST',
		body: JSON.stringify({ query, variables })
	});
	if (!response.ok) throw await ghError(response, 'GraphQL request failed');
	const body = await response.json();
	if (body.errors?.length) {
		throw new Error(`GraphQL error: ${body.errors.map((e: any) => e.message).join('; ')}`);
	}
	return body.data as T;
}

/** Everything the feedback and revision code needs about a PR. */
export interface PullRequestDetails {
	number: number;
	title: string;
	body: string;
	html_url: string;
	state: 'open' | 'closed';
	merged: boolean;
	draft: boolean;
	author: string;
	author_type: string;
	updated_at: string;
	closed_at: string | null;
	head_sha: string;
	head_ref: string;
	/** null when the head repository (a fork) has been deleted. */
	head_owner: string | null;
	head_repo: string | null;
	base_ref: string;
	base_sha: string;
	maintainer_can_modify: boolean;
}

export async function getPullRequestDetails(
	token: string | null,
	owner: string,
	repo: string,
	prNumber: number
): Promise<PullRequestDetails | null> {
	const response = await ghGet(token, `/repos/${owner}/${repo}/pulls/${prNumber}`);
	if (response.status === 404) return null;
	if (!response.ok) throw await ghError(response, 'Failed to get PR');
	const pr = await response.json();
	return {
		number: pr.number,
		title: pr.title ?? '',
		body: pr.body ?? '',
		html_url: pr.html_url,
		state: pr.state,
		merged: pr.merged === true,
		draft: pr.draft === true,
		author: pr.user?.login ?? 'ghost',
		author_type: pr.user?.type ?? 'User',
		updated_at: pr.updated_at,
		closed_at: pr.closed_at ?? null,
		head_sha: pr.head.sha,
		head_ref: pr.head.ref,
		head_owner: pr.head.repo?.owner?.login ?? null,
		head_repo: pr.head.repo?.name ?? null,
		base_ref: pr.base.ref,
		base_sha: pr.base.sha,
		maintainer_can_modify: pr.maintainer_can_modify === true
	};
}

export interface PullRequestFile {
	filename: string;
	status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
	previous_filename?: string;
}

/** The files a PR changes (GitHub caps this listing at 3000 files). */
export async function getPullRequestFiles(
	token: string | null,
	owner: string,
	repo: string,
	prNumber: number
): Promise<PullRequestFile[]> {
	const files: PullRequestFile[] = [];
	for (let page = 1; page <= 30; page++) {
		const response = await ghGet(
			token,
			`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`
		);
		if (!response.ok) throw await ghError(response, 'Failed to list PR files');
		const batch = await response.json();
		for (const f of batch) {
			files.push({ filename: f.filename, status: f.status, previous_filename: f.previous_filename });
		}
		if (batch.length < 100) break;
	}
	return files;
}

/** The merge base of two commits, which is what a PR's diff is measured against. */
export async function getMergeBase(
	token: string | null,
	owner: string,
	repo: string,
	base: string,
	head: string
): Promise<string> {
	const response = await ghGet(
		token,
		`/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=1`
	);
	if (!response.ok) throw await ghError(response, 'Failed to compare commits');
	const body = await response.json();
	return body.merge_base_commit.sha;
}

export interface IssueComment {
	id: number;
	body: string;
	author: string;
	author_type: string;
	created_at: string;
}

export async function listIssueComments(
	token: string | null,
	owner: string,
	repo: string,
	issueNumber: number
): Promise<IssueComment[]> {
	const comments: IssueComment[] = [];
	for (let page = 1; page <= 10; page++) {
		const response = await ghGet(
			token,
			`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`
		);
		if (!response.ok) throw await ghError(response, 'Failed to list comments');
		const batch = await response.json();
		for (const c of batch) {
			comments.push({
				id: c.id,
				body: c.body ?? '',
				author: c.user?.login ?? 'ghost',
				author_type: c.user?.type ?? 'User',
				created_at: c.created_at
			});
		}
		if (batch.length < 100) break;
	}
	return comments;
}

/**
 * Create or update a "sticky" comment identified by an HTML-comment `marker`.
 *
 * Only the newest marked comment written by a bot is edited, the same rule as the brand
 * sign-off comment (`ofd/commands/claims.py`), so a human quoting the marker can't make the
 * bot overwrite their comment.
 */
export async function upsertMarkedComment(
	token: string,
	owner: string,
	repo: string,
	issueNumber: number,
	marker: string,
	body: string
): Promise<void> {
	const comments = await listIssueComments(token, owner, repo, issueNumber);
	const existing = comments
		.filter((c) => c.author_type === 'Bot' && c.body.includes(marker))
		.at(-1);
	const fullBody = body.includes(marker) ? body : `${marker}\n${body}`;
	if (!existing) {
		await createIssueComment(token, owner, repo, issueNumber, fullBody);
		return;
	}
	const response = await ghFetch(token, `/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
		method: 'PATCH',
		body: JSON.stringify({ body: fullBody })
	});
	if (!response.ok) throw await ghError(response, 'Failed to update comment');
}

/** Read a binary blob as base64 (logos). Returns null when the blob is gone. */
export async function getBlobBase64(
	token: string | null,
	owner: string,
	repo: string,
	sha: string
): Promise<string | null> {
	const response = await ghGet(token, `/repos/${owner}/${repo}/git/blobs/${sha}`);
	if (response.status === 404) return null;
	if (!response.ok) throw await ghError(response, 'Failed to get blob');
	const blob = await response.json();
	if (typeof blob.content !== 'string' || blob.encoding !== 'base64') return null;
	return blob.content.replace(/\n/g, '');
}

export interface PullRequestListItem {
	number: number;
	title: string;
	html_url: string;
	state: 'open' | 'closed';
	merged: boolean;
	author: string;
	head_ref: string;
	head_owner: string | null;
	updated_at: string;
	closed_at: string | null;
	maintainer_can_modify: boolean;
}

/**
 * List pull requests, newest-updated first. `state: 'closed'` also returns merged ones
 * (`merged: true`). Stops after `limit` results.
 */
export async function listPullRequests(
	token: string | null,
	owner: string,
	repo: string,
	state: 'open' | 'closed',
	limit = 100
): Promise<PullRequestListItem[]> {
	const out: PullRequestListItem[] = [];
	for (let page = 1; out.length < limit && page <= 10; page++) {
		const response = await ghGet(
			token,
			`/repos/${owner}/${repo}/pulls?state=${state}&sort=updated&direction=desc&per_page=100&page=${page}`
		);
		if (!response.ok) throw await ghError(response, 'Failed to list PRs');
		const batch = await response.json();
		for (const pr of batch) {
			out.push({
				number: pr.number,
				title: pr.title ?? '',
				html_url: pr.html_url,
				state: pr.state,
				merged: pr.merged_at != null,
				author: pr.user?.login ?? 'ghost',
				head_ref: pr.head?.ref ?? '',
				head_owner: pr.head?.repo?.owner?.login ?? null,
				updated_at: pr.updated_at,
				closed_at: pr.closed_at ?? null,
				maintainer_can_modify: pr.maintainer_can_modify === true
			});
		}
		if (batch.length < 100) break;
	}
	return out.slice(0, limit);
}

/** A file's text at a commit, or null when it doesn't exist there. */
export async function getFileTextAtRef(
	token: string | null,
	owner: string,
	repo: string,
	filePath: string,
	ref: string
): Promise<string | null> {
	const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
	const response = await ghGet(
		token,
		`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
	);
	if (response.status === 404) return null;
	if (!response.ok) throw await ghError(response, 'Failed to get file');
	const body = await response.json();
	if (typeof body.content !== 'string' || body.encoding !== 'base64') return null;
	return Buffer.from(body.content, 'base64').toString('utf-8');
}

/**
 * Post a COMMENT review: a body plus comments on lines of the PR's diff, at `commitSha`.
 * GitHub refuses the whole review (422) if any line is outside the diff.
 */
export async function createReview(
	token: string,
	owner: string,
	repo: string,
	prNumber: number,
	commitSha: string,
	body: string,
	comments: { path: string; line: number; body: string }[]
): Promise<void> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
		method: 'POST',
		body: JSON.stringify({
			commit_id: commitSha,
			event: 'COMMENT',
			body,
			comments: comments.map((c) => ({ ...c, side: 'RIGHT' }))
		})
	});
	if (!response.ok) throw await ghError(response, 'Failed to post review');
}

