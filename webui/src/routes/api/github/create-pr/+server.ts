import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitHubToken, getGitHubUser } from '$lib/server/auth';
import { GITHUB_UPSTREAM_OWNER, GITHUB_UPSTREAM_REPO } from '$env/static/private';
import {
	forkRepo,
	getLatestCommitSha,
	getCommitTreeSha,
	createBranch,
	createBlob,
	createTree,
	createCommit,
	updateRef,
	createPullRequest
} from '$lib/server/github';

/**
 * Map an entity path to a file path in the repository.
 * Same mapping as the batch save endpoint but relative to repo root.
 */
function entityPathToRepoPath(entityPath: string): string | null {
	const parts = entityPath.split('/');

	if (parts[0] === 'stores' && parts.length === 2) {
		return `stores/${parts[1]}/store.json`;
	}

	if (parts[0] === 'brands') {
		if (parts.length === 2) {
			return `data/${parts[1]}/brand.json`;
		}
		if (parts.length === 4 && parts[2] === 'materials') {
			return `data/${parts[1]}/${parts[3]}/material.json`;
		}
		if (parts.length === 6 && parts[2] === 'materials' && parts[4] === 'filaments') {
			return `data/${parts[1]}/${parts[3]}/${parts[5]}/filament.json`;
		}
		if (parts.length === 8 && parts[2] === 'materials' && parts[4] === 'filaments' && parts[6] === 'variants') {
			return `data/${parts[1]}/${parts[3]}/${parts[5]}/${parts[7]}/variant.json`;
		}
	}

	return null;
}

/**
 * Fields to strip from entity data before committing
 */
const STRIP_FIELDS = new Set([
	'brandId', 'brand_id', 'materialType', 'filamentDir', 'filament_id'
]);

function cleanEntityData(data: any): any {
	const clean: Record<string, any> = {};
	for (const [key, value] of Object.entries(data)) {
		if (!STRIP_FIELDS.has(key)) {
			clean[key] = value;
		}
	}
	return clean;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = getGitHubToken(cookies);
	if (!token) {
		return json({ error: 'Not authenticated. Please login to GitHub first.' }, { status: 401 });
	}

	if (!GITHUB_UPSTREAM_OWNER || !GITHUB_UPSTREAM_REPO) {
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
		const fork = await forkRepo(token, GITHUB_UPSTREAM_OWNER, GITHUB_UPSTREAM_REPO);

		// Wait for fork to be ready by polling its main branch
		let forkSha: string | null = null;
		for (let attempt = 0; attempt < 10; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, attempt < 2 ? 2000 : 3000));
			try {
				forkSha = await getLatestCommitSha(token, fork.owner, fork.repo, 'main');
				break;
			} catch {
				// Fork not ready yet, retry
			}
		}
		if (!forkSha) {
			return json({ error: 'Fork took too long to be ready. Please try again.' }, { status: 504 });
		}

		// Get the tree SHA for the base commit (from fork)
		const baseTreeSha = await getCommitTreeSha(
			token,
			fork.owner,
			fork.repo,
			forkSha
		);

		// Create branch on fork using the fork's own SHA
		const branchName = `ofd-changes-${Date.now()}`;
		await createBranch(token, fork.owner, fork.repo, branchName, forkSha);

		// Create blobs for each change
		const treeItems: Array<{ path: string; sha: string | null; mode?: string }> = [];

		for (const change of changes) {
			const repoPath = entityPathToRepoPath(change.entity.path);
			if (!repoPath) continue;

			if (change.operation === 'delete') {
				// Mark for deletion by setting sha to null
				treeItems.push({ path: repoPath, sha: null });
			} else if (change.data) {
				// Create/update: create a blob with the entity data
				const cleanData = cleanEntityData(change.data);
				const content = JSON.stringify(cleanData, null, 4) + '\n';
				const blobSha = await createBlob(token, fork.owner, fork.repo, content);
				treeItems.push({ path: repoPath, sha: blobSha });
			}
		}

		// Handle images
		if (images && typeof images === 'object') {
			for (const [imageId, imageData] of Object.entries(images) as [string, any][]) {
				if (!imageData.entityPath || !imageData.data || !imageData.filename) continue;

				const entityDir = entityPathToRepoPath(imageData.entityPath);
				if (!entityDir) continue;

				const imageRepoPath = entityDir.replace(/\/[^/]+\.json$/, `/${imageData.filename}`);
				const blobSha = await createBlob(token, fork.owner, fork.repo, imageData.data, 'base64');
				treeItems.push({ path: imageRepoPath, sha: blobSha });
			}
		}

		if (treeItems.length === 0) {
			return json({ error: 'No valid changes to commit' }, { status: 400 });
		}

		// Create tree
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
			forkSha
		);

		// Update branch to point to new commit
		await updateRef(token, fork.owner, fork.repo, branchName, commitSha);

		// Build PR body
		const changesSummary = changes.map((c: any) => {
			const op = c.operation === 'create' ? '+' : c.operation === 'delete' ? '-' : '~';
			return `- [${op}] ${c.description || c.entity.path}`;
		}).join('\n');

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
			GITHUB_UPSTREAM_OWNER,
			GITHUB_UPSTREAM_REPO,
			`${fork.owner}:${branchName}`,
			'main',
			prTitle,
			prBody
		);

		return json({
			success: true,
			prUrl: pr.html_url,
			prNumber: pr.number
		});
	} catch (error: any) {
		console.error('PR creation error:', error);
		return json({ error: error.message || 'Failed to create PR' }, { status: 500 });
	}
};
