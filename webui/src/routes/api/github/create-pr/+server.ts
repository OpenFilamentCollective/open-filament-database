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
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, 'schemas');

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
	'brandId', 'brand_id', 'materialType', 'filamentDir', 'filament_id', 'slug'
]);

/**
 * Build a lookup from image IDs to their actual filenames
 */
function buildImageFilenameMap(images: Record<string, any> | undefined): Map<string, string> {
	const map = new Map<string, string>();
	if (images && typeof images === 'object') {
		for (const [imageId, imageData] of Object.entries(images)) {
			if (imageData?.filename) {
				map.set(imageId, imageData.filename);
			}
		}
	}
	return map;
}

function cleanEntityData(data: any, imageFilenames: Map<string, string>): any {
	const clean: Record<string, any> = {};
	for (const [key, value] of Object.entries(data)) {
		if (STRIP_FIELDS.has(key)) continue;

		// Resolve image reference IDs to actual filenames (e.g. logo field)
		if (key === 'logo' && typeof value === 'string' && imageFilenames.has(value)) {
			clean[key] = imageFilenames.get(value);
			continue;
		}

		// Default required fields that would fail validation if empty
		if (key === 'origin' && (value === '' || value === undefined)) {
			clean[key] = 'Unknown';
			continue;
		}

		// Strip empty strings for pattern-validated fields
		if (value === '') continue;

		clean[key] = value;
	}
	return clean;
}

/**
 * Schema key ordering for sorting JSON output to match repo conventions.
 * Loaded lazily from schema files on first use.
 */
type SchemaInfo = {
	keys: string[];
	nested: Record<string, string[]>;
};

let schemaKeyOrders: Record<string, SchemaInfo> | null = null;

function getPropertyOrder(schema: any): string[] {
	if (schema?.properties) {
		return Object.keys(schema.properties);
	}
	return [];
}

function extractNestedSchemas(schema: any): Record<string, string[]> {
	const nested: Record<string, string[]> = {};
	if (!schema?.properties) return nested;

	for (const [propName, propSchema] of Object.entries(schema.properties) as [string, any][]) {
		if (propSchema?.type === 'object' && propSchema.properties) {
			nested[propName] = getPropertyOrder(propSchema);
		} else if (propSchema?.type === 'array' && propSchema.items?.type === 'object' && propSchema.items.properties) {
			nested[propName] = getPropertyOrder(propSchema.items);
		}
	}

	if (schema.definitions) {
		for (const [defName, defSchema] of Object.entries(schema.definitions) as [string, any][]) {
			if (defSchema?.type === 'object' && defSchema.properties) {
				nested[defName] = getPropertyOrder(defSchema);
			}
		}
	}

	return nested;
}

function loadSchemaKeyOrders(): Record<string, SchemaInfo> {
	if (schemaKeyOrders) return schemaKeyOrders;

	const schemaFiles: Record<string, string> = {
		brand: 'brand_schema.json',
		material: 'material_schema.json',
		filament: 'filament_schema.json',
		variant: 'variant_schema.json',
		store: 'store_schema.json',
		sizes: 'sizes_schema.json'
	};

	schemaKeyOrders = {};
	for (const [name, filename] of Object.entries(schemaFiles)) {
		try {
			const content = readFileSync(path.join(SCHEMAS_DIR, filename), 'utf-8');
			const schema = JSON.parse(content);

			// Handle array-type schemas (sizes)
			const effectiveSchema = schema.type === 'array' && schema.items ? schema.items : schema;

			schemaKeyOrders[name] = {
				keys: getPropertyOrder(effectiveSchema),
				nested: extractNestedSchemas(effectiveSchema)
			};
		} catch {
			// Schema not found or invalid, skip
		}
	}

	return schemaKeyOrders;
}

/**
 * Sort JSON keys to match schema property ordering (matches style_data.py behavior).
 */
function sortJsonKeys(data: any, schemaInfo: SchemaInfo): any {
	if (Array.isArray(data)) {
		return data.map(item =>
			typeof item === 'object' && item !== null ? sortJsonKeys(item, schemaInfo) : item
		);
	}

	if (typeof data !== 'object' || data === null) return data;

	const ordered: Record<string, any> = {};
	const remaining = new Set(Object.keys(data));

	// Add keys in schema order
	for (const key of schemaInfo.keys) {
		if (key in data) {
			let value = data[key];

			if (key in schemaInfo.nested) {
				const nestedInfo: SchemaInfo = { keys: schemaInfo.nested[key], nested: schemaInfo.nested };
				if (Array.isArray(value)) {
					value = value.map(item =>
						typeof item === 'object' && item !== null ? sortJsonKeys(item, nestedInfo) : item
					);
				} else if (typeof value === 'object' && value !== null) {
					value = sortJsonKeys(value, nestedInfo);
				}
			} else if (Array.isArray(value)) {
				value = value.map(item =>
					typeof item === 'object' && item !== null ? sortJsonKeys(item, { keys: [], nested: {} }) : item
				);
			} else if (typeof value === 'object' && value !== null) {
				value = sortJsonKeys(value, { keys: [], nested: {} });
			}

			ordered[key] = value;
			remaining.delete(key);
		}
	}

	// Add remaining keys alphabetically
	for (const key of [...remaining].sort()) {
		let value = data[key];
		if (typeof value === 'object' && value !== null) {
			value = Array.isArray(value)
				? value.map(item => typeof item === 'object' && item !== null ? sortJsonKeys(item, { keys: [], nested: {} }) : item)
				: sortJsonKeys(value, { keys: [], nested: {} });
		}
		ordered[key] = value;
	}

	return ordered;
}

/**
 * Determine schema type from a repo file path.
 */
function getSchemaType(repoPath: string): string | null {
	if (repoPath.endsWith('/brand.json')) return 'brand';
	if (repoPath.endsWith('/material.json')) return 'material';
	if (repoPath.endsWith('/filament.json')) return 'filament';
	if (repoPath.endsWith('/variant.json')) return 'variant';
	if (repoPath.endsWith('/store.json')) return 'store';
	if (repoPath.endsWith('/sizes.json')) return 'sizes';
	return null;
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

		// Get latest SHA directly from upstream main.
		// GitHub forks share the underlying object store, so upstream SHAs are
		// accessible on the fork — no need to sync the fork first.
		const upstreamSha = await getLatestCommitSha(
			token, GITHUB_UPSTREAM_OWNER, GITHUB_UPSTREAM_REPO, 'main'
		);
		const baseTreeSha = await getCommitTreeSha(
			token, GITHUB_UPSTREAM_OWNER, GITHUB_UPSTREAM_REPO, upstreamSha
		);

		// Create branch on fork from upstream SHA (retry for newly-created forks)
		const branchName = `ofd-changes-${Date.now()}`;
		let branchCreated = false;
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				await createBranch(token, fork.owner, fork.repo, branchName, upstreamSha);
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

		// Build image filename lookup for resolving references in entity data
		const imageFilenames = buildImageFilenameMap(images);

		// Load schema key orderings for styling output JSON
		const schemas = loadSchemaKeyOrders();

		// Create blobs for each change
		const treeItems: Array<{ path: string; sha: string | null; mode?: string }> = [];

		for (const change of changes) {
			const repoPath = entityPathToRepoPath(change.entity.path);
			if (!repoPath) continue;

			if (change.operation === 'delete') {
				// Mark for deletion by setting sha to null
				treeItems.push({ path: repoPath, sha: null });
			} else if (change.data) {
				// Create/update: clean, sort keys per schema, then create blob
				let cleanData = cleanEntityData(change.data, imageFilenames);

				const schemaType = getSchemaType(repoPath);
				if (schemaType && schemas[schemaType]) {
					cleanData = sortJsonKeys(cleanData, schemas[schemaType]);
				}

				const content = JSON.stringify(cleanData, null, 2) + '\n';
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
			upstreamSha
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
