import path from 'path';

const REPO_ROOT = path.resolve(process.cwd(), '..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const STORES_DIR = path.join(REPO_ROOT, 'stores');

/** Validates that a path segment contains only safe filesystem characters. */
export const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_\-. ]*$/;

/**
 * Fields to strip from entity data before writing to disk.
 * These are internal tracking fields added by the webui.
 */
export const STRIP_FIELDS = new Set([
	'brandId', 'brand_id', 'materialType', 'filamentDir', 'filament_id', 'slug'
]);

/**
 * Map an entity path (e.g., "brands/prusament/materials/PLA") to a filesystem path.
 *
 * Path mapping:
 * - stores/{slug}                                     → ../stores/{slug}/store.json
 * - brands/{slug}                                     → ../data/{slug}/brand.json
 * - brands/{slug}/materials/{type}                    → ../data/{slug}/{type}/material.json
 * - brands/{slug}/materials/{type}/filaments/{name}   → ../data/{slug}/{type}/{name}/filament.json
 * - brands/{slug}/materials/{type}/filaments/{name}/variants/{variant} → ../data/{slug}/{type}/{name}/{variant}/variant.json
 */
export function entityPathToFsPath(entityPath: string): string | null {
	const parts = entityPath.split('/');

	// Reject empty segments or segments with unsafe characters
	for (const part of parts) {
		if (!SAFE_SEGMENT.test(part)) return null;
	}

	if (parts[0] === 'stores' && parts.length === 2) {
		return path.join(STORES_DIR, parts[1], 'store.json');
	}

	if (parts[0] === 'brands') {
		if (parts.length === 2) {
			return path.join(DATA_DIR, parts[1], 'brand.json');
		}
		if (parts.length === 4 && parts[2] === 'materials') {
			return path.join(DATA_DIR, parts[1], parts[3], 'material.json');
		}
		if (parts.length === 6 && parts[2] === 'materials' && parts[4] === 'filaments') {
			return path.join(DATA_DIR, parts[1], parts[3], parts[5], 'filament.json');
		}
		if (parts.length === 8 && parts[2] === 'materials' && parts[4] === 'filaments' && parts[6] === 'variants') {
			return path.join(DATA_DIR, parts[1], parts[3], parts[5], parts[7], 'variant.json');
		}
	}

	return null;
}

/**
 * Map an entity path to its directory (for deletion and logo writing).
 */
export function entityPathToDir(entityPath: string): string | null {
	const fsPath = entityPathToFsPath(entityPath);
	return fsPath ? path.dirname(fsPath) : null;
}

/**
 * Remove internal tracking fields and empty strings from entity data.
 */
export function cleanEntityData(data: Record<string, unknown>): Record<string, unknown> {
	const clean: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (STRIP_FIELDS.has(key)) continue;
		if (value === '') continue;
		clean[key] = value;
	}
	return clean;
}
