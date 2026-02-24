/**
 * Shared PR-building logic: tree construction, schema ordering, image handling.
 * Used by both OAuth and anonymous bot PR creation.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { IS_CLOUD, API_BASE } from '$lib/server/cloudProxy';
import { SAFE_SEGMENT, cleanEntityData, JSON_INDENT_REPO } from '$lib/server/saveUtils';
import {
	getRecursiveTree,
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

	// Reject segments with unsafe characters
	for (const part of parts) {
		if (!SAFE_SEGMENT.test(part)) return null;
	}

	if (parts[0] === 'stores' && parts.length === 2) {
		// Store IDs: hyphens removed in repo dirs
		const storeDir = parts[1].replace(/-/g, '');
		return `stores/${storeDir}/store.json`;
	}

	if (parts[0] === 'brands') {
		// Brand IDs: hyphens → underscores in repo dirs
		const brandDir = parts[1].replace(/-/g, '_');
		if (parts.length === 2) {
			return `data/${brandDir}/brand.json`;
		}
		if (parts.length >= 4 && parts[2] === 'materials') {
			// Material types: UPPERCASE in repo dirs
			const materialDir = parts[3].toUpperCase();
			if (parts.length === 4) {
				return `data/${brandDir}/${materialDir}/material.json`;
			}
			if (parts.length >= 6 && parts[4] === 'filaments') {
				// Filament slugs: hyphens → underscores in repo dirs
				const filamentDir = parts[5].replace(/-/g, '_');
				if (parts.length === 6) {
					return `data/${brandDir}/${materialDir}/${filamentDir}/filament.json`;
				}
				if (parts.length === 8 && parts[6] === 'variants') {
					// Variant slugs: hyphens → underscores in repo dirs
					const variantDir = parts[7].replace(/-/g, '_');
					return `data/${brandDir}/${materialDir}/${filamentDir}/${variantDir}/variant.json`;
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
 * Build tree items from a set of changes and images.
 * Returns the items ready for createTree() and a list of skipped paths.
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
): Promise<{ treeItems: TreeItem[]; skippedPaths: string[] }> {
	const imageFilenames = buildImageFilenameMap(images);
	const schemas = await loadSchemaKeyOrders();

	const treeItems: TreeItem[] = [];
	const skippedPaths: string[] = [];

	// Check if any changes are deletes — we need the recursive tree listing
	// to discover all files under a deleted entity's directory for cascade delete.
	const hasDeletes = changes.some((c: any) => c.operation === 'delete');
	let existingTree: Map<string, { sha: string; mode: string; type: string }> | null = null;
	if (hasDeletes) {
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
			if (existingTree) {
				for (const existingPath of existingTree.keys()) {
					if (existingPath.startsWith(dirPrefix)) {
						treeItems.push({ path: existingPath, sha: null });
					}
				}
			}
		} else if (change.data) {
			const schemaType = getSchemaType(repoPath);
			// Create/update: clean, sort keys per schema, then create blob
			let cleanData = cleanEntityData(change.data, { imageFilenames, schemaType });

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
				let sortedSizes: any = sizesData;
				if (schemas['sizes']) {
					sortedSizes = sortJsonKeys(sizesData, schemas['sizes']);
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

	return { treeItems, skippedPaths };
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
