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
	parentSha: string
): Promise<string> {
	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/commits`, {
		method: 'POST',
		body: JSON.stringify({
			message,
			tree: treeSha,
			parents: [parentSha]
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
