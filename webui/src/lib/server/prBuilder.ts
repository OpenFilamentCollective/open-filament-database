/**
 * Shared PR-building logic: tree construction, schema ordering, image handling.
 * Used by both OAuth and anonymous bot PR creation.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { IS_CLOUD, API_BASE } from '$lib/server/cloudProxy';
import {
	SAFE_SEGMENT,
	isUuidSegment,
	cleanEntityData,
	preserveCanonicalFields,
	JSON_INDENT_REPO
} from '$lib/server/saveUtils';
import {
	getRecursiveTree,
	getBlobText,
	createBlob
} from '$lib/server/github';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, 'schemas');

/**
 * Map an entity path to a file path in the repository.
 * Same mapping as the batch save endpoint but relative to repo root.
 */
export function entityPathToRepoPath(entityPath: string): string | null {
	const parts = entityPath.split('/');

	// Reject segments with unsafe characters or UUID-shaped segments (a UUID here
	// means a slug mapping failed; never let it become a folder name in a PR).
	for (const part of parts) {
		if (!SAFE_SEGMENT.test(part) || isUuidSegment(part)) return null;
	}

	if (parts[0] === 'stores' && parts.length === 2) {
		return `stores/${parts[1]}/store.json`;
	}

	if (parts[0] === 'brands') {
		const brandDir = parts[1];
		if (parts.length === 2) {
			return `data/${brandDir}/brand.json`;
		}
		if (parts.length >= 4 && parts[2] === 'materials') {
			const materialDir = parts[3].toUpperCase();
			if (parts.length === 4) {
				return `data/${brandDir}/${materialDir}/material.json`;
			}
			if (parts.length >= 6 && parts[4] === 'filaments') {
				const filamentDir = parts[5];
				if (parts.length === 6) {
					return `data/${brandDir}/${materialDir}/${filamentDir}/filament.json`;
				}
				if (parts.length === 8 && parts[6] === 'variants') {
					return `data/${brandDir}/${materialDir}/${filamentDir}/${parts[7]}/variant.json`;
				}
			}
		}
	}

	return null;
}

/**
 * Build a lookup from image IDs to their actual filenames
 */
export function buildImageFilenameMap(images: Record<string, any> | undefined): Map<string, string> {
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

export async function loadSchemaKeyOrders(): Promise<Record<string, SchemaInfo>> {
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
			let schema: any;

			if (IS_CLOUD) {
				const response = await fetch(`${API_BASE}/api/v1/schemas/${filename}`);
				if (!response.ok) continue;
				schema = await response.json();
			} else {
				const content = await fs.readFile(path.join(SCHEMAS_DIR, filename), 'utf-8');
				schema = JSON.parse(content);
			}

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
export function sortJsonKeys(data: any, schemaInfo: SchemaInfo): any {
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
export function getSchemaType(repoPath: string): string | null {
	if (repoPath.endsWith('/brand.json')) return 'brand';
	if (repoPath.endsWith('/material.json')) return 'material';
	if (repoPath.endsWith('/filament.json')) return 'filament';
	if (repoPath.endsWith('/variant.json')) return 'variant';
	if (repoPath.endsWith('/store.json')) return 'store';
	if (repoPath.endsWith('/sizes.json')) return 'sizes';
	return null;
}

export type TreeItem = { path: string; sha: string | null; mode?: string; type?: string };

/**
 * A delete change that produced no tree items because the target entity has no
 * files in the upstream repo — it was never published, or has already been
 * removed. Such a deletion is a no-op for the PR (there is nothing to delete).
 */
export type NoopDelete = { path: string; description?: string };

type ExistingTree = Map<string, { sha: string; mode: string; type: string }>;

/**
 * Read and parse the JSON currently committed at `repoPath`, or null when the
 * path is new or its blob isn't readable JSON. Used to carry canonical identity
 * fields onto a write that would otherwise replace the file wholesale.
 */
async function readUpstreamJson(
	token: string,
	owner: string,
	repo: string,
	tree: ExistingTree | null,
	repoPath: string
): Promise<unknown> {
	const entry = tree?.get(repoPath);
	if (!entry) return null;

	const text = await getBlobText(token, owner, repo, entry.sha);
	if (text === null) return null;

	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * Build tree items from a set of changes and images.
 * Returns the items ready for createTree(), a list of skipped (unmappable)
 * paths, and a list of no-op deletes (deletes with no upstream target).
 */
export async function buildTreeItems(
	token: string,
	forkOwner: string,
	forkRepo: string,
	baseTreeSha: string,
	upstreamOwner: string,
	upstreamRepo: string,
	changes: any[],
	images: Record<string, any> | undefined
): Promise<{ treeItems: TreeItem[]; skippedPaths: string[]; noopDeletes: NoopDelete[] }> {
	const imageFilenames = buildImageFilenameMap(images);
	const schemas = await loadSchemaKeyOrders();

	const treeItems: TreeItem[] = [];
	const skippedPaths: string[] = [];
	const noopDeletes: NoopDelete[] = [];

	// The recursive tree listing serves both kinds of change: deletes need it to
	// discover every file under a deleted entity's directory (cascade delete), and
	// writes need it to tell a genuinely new path from one that already holds a
	// committed file whose canonical identity must be carried over.
	const hasDeletes = changes.some((c: any) => c.operation === 'delete');
	const hasWrites = changes.some((c: any) => c.operation !== 'delete' && c.data);
	let existingTree: ExistingTree | null = null;
	if (hasDeletes || hasWrites) {
		existingTree = await getRecursiveTree(
			token, upstreamOwner, upstreamRepo, baseTreeSha
		);
	}

	for (const change of changes) {
		const repoPath = entityPathToRepoPath(change.entity.path);
		if (!repoPath) {
			skippedPaths.push(change.entity.path);
			continue;
		}

		if (change.operation === 'delete') {
			// Cascade delete: find all files under this entity's directory
			const dirPrefix = repoPath.replace(/\/[^/]+$/, '/');
			let matched = 0;
			if (existingTree) {
				for (const existingPath of existingTree.keys()) {
					if (existingPath.startsWith(dirPrefix)) {
						treeItems.push({ path: existingPath, sha: null });
						matched++;
					}
				}
			}
			if (matched === 0) {
				// Nothing exists upstream under this path, so the deletion can't be
				// expressed as a PR — the entity was never published or is already
				// gone. Treat it as a no-op and record it so the caller can explain
				// why it produced no committable change.
				noopDeletes.push({ path: change.entity.path, description: change.description });
			}
		} else if (change.data) {
			const schemaType = getSchemaType(repoPath);
			// Create/update: clean, sort keys per schema, then create blob
			let cleanData = cleanEntityData(change.data, { imageFilenames, schemaType });

			// This write replaces the file, and the payload may predate UUID
			// assignment (e.g. a `create` staged before the entity was published,
			// then submitted again after it merged). Keep whatever canonical
			// identity is already committed here rather than dropping it.
			cleanData = preserveCanonicalFields(
				cleanData,
				await readUpstreamJson(token, upstreamOwner, upstreamRepo, existingTree, repoPath)
			);

			// For variant entities, extract sizes into a separate file
			let sizesData = null;
			if (schemaType === 'variant' && cleanData.sizes) {
				sizesData = cleanData.sizes;
				delete cleanData.sizes;
			}

			if (schemaType && schemas[schemaType]) {
				cleanData = sortJsonKeys(cleanData, schemas[schemaType]);
			}

			const content = JSON.stringify(cleanData, null, JSON_INDENT_REPO) + '\n';
			const blobSha = await createBlob(token, forkOwner, forkRepo, content);
			treeItems.push({ path: repoPath, sha: blobSha, mode: '100644', type: 'blob' });

			// Write sizes.json alongside variant.json
			if (sizesData && Array.isArray(sizesData) && sizesData.length > 0) {
				const sizesRepoPath = repoPath.replace(/variant\.json$/, 'sizes.json');
				// Spools carry their own canonical UUIDs; pair them with the committed
				// ones by (filament_weight, diameter) so a rewrite keeps them too.
				let sortedSizes: any = preserveCanonicalFields(
					sizesData,
					await readUpstreamJson(token, upstreamOwner, upstreamRepo, existingTree, sizesRepoPath)
				);
				if (schemas['sizes']) {
					sortedSizes = sortJsonKeys(sortedSizes, schemas['sizes']);
				}
				const sizesContent = JSON.stringify(sortedSizes, null, JSON_INDENT_REPO) + '\n';
				const sizesBlobSha = await createBlob(token, forkOwner, forkRepo, sizesContent);
				treeItems.push({ path: sizesRepoPath, sha: sizesBlobSha, mode: '100644', type: 'blob' });
			}
		}
	}

	// Handle images
	if (images && typeof images === 'object') {
		for (const [imageId, imageData] of Object.entries(images) as [string, any][]) {
			if (!imageData.entityPath || !imageData.data || !imageData.filename) continue;

			const entityDir = entityPathToRepoPath(imageData.entityPath);
			if (!entityDir) continue;

			const imageRepoPath = entityDir.replace(/\/[^/]+\.json$/, `/${imageData.filename}`);
			const blobSha = await createBlob(token, forkOwner, forkRepo, imageData.data, 'base64');
			treeItems.push({ path: imageRepoPath, sha: blobSha, mode: '100644', type: 'blob' });
		}
	}

	return { treeItems, skippedPaths, noopDeletes };
}

/**
 * Build a user-facing explanation for why a changeset produced no committable
 * tree items. Used when treeItems is empty so the user gets an actionable
 * reason instead of a bare "no valid changes" message.
 */
export function explainEmptyTree(skippedPaths: string[], noopDeletes: NoopDelete[]): string {
	const reasons: string[] = [];

	if (noopDeletes.length > 0) {
		const names = noopDeletes.map((d) => d.description || d.path).join(', ');
		reasons.push(
			noopDeletes.length === 1
				? `This deletion can't be submitted because the item isn't in the database — it may have already been removed, or was never published: ${names}.`
				: `These deletions can't be submitted because the items aren't in the database (already removed, or never published): ${names}.`
		);
	}

	if (skippedPaths.length > 0) {
		reasons.push(`Some changes referenced paths that couldn't be mapped to the database: ${skippedPaths.join(', ')}.`);
	}

	const detail = reasons.length > 0 ? ` ${reasons.join(' ')}` : '';
	return `No changes to submit.${detail}`;
}

/**
 * Build a human-readable summary of changes for a PR body.
 */
export function buildChangesSummary(changes: any[]): string {
	return changes.map((c: any) => {
		const op = c.operation === 'create' ? '+' : c.operation === 'delete' ? '-' : '~';
		return `- [${op}] ${c.description || c.entity.path}`;
	}).join('\n');
}
