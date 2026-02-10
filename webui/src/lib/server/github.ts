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
		throw new Error(`Failed to get branch ref: ${response.status}`);
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
		throw new Error(`Failed to create blob: ${response.status}`);
	}

	const blob = await response.json();
	return blob.sha;
}

/**
 * Create a tree (directory listing) in the repository
 */
export async function createTree(
	token: string,
	owner: string,
	repo: string,
	baseTreeSha: string,
	items: Array<{ path: string; sha: string | null; mode?: string; type?: string }>
): Promise<string> {
	const tree = items.map((item) => ({
		path: item.path,
		mode: item.mode || '100644',
		type: item.type || 'blob',
		sha: item.sha
	}));

	const response = await ghFetch(token, `/repos/${owner}/${repo}/git/trees`, {
		method: 'POST',
		body: JSON.stringify({ base_tree: baseTreeSha, tree })
	});

	if (!response.ok) {
		throw new Error(`Failed to create tree: ${response.status}`);
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
		throw new Error(`Failed to create commit: ${response.status}`);
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
		throw new Error(`Failed to update ref: ${response.status}`);
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
		throw new Error(`Failed to get commit: ${response.status}`);
	}

	const commit = await response.json();
	return commit.tree.sha;
}
