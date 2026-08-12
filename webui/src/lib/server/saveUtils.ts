import path from 'path';

const REPO_ROOT = path.resolve(process.cwd(), '..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const STORES_DIR = path.join(REPO_ROOT, 'stores');

/** JSON indentation for local filesystem writes */
export const JSON_INDENT_LOCAL = 4;
/** JSON indentation for repo/PR writes (matches repo convention) */
export const JSON_INDENT_REPO = 2;

/**
 * Validates that a path segment contains only safe filesystem characters.
 * Allows `+` after the first character, since many existing filament folders
 * use it (e.g. `pla+`, `high_speed_pla+`, `nylon_pa12+cf15`). The first
 * character must still be alphanumeric, preventing `.`/`-`/`_`-prefixed names
 * and path traversal (`..`).
 */
export const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_\-.+]*$/;

/**
 * Matches a UUID used as a path segment, in either the dash form
 * (`1d35f140-7cba-5fa4-9bb6-9e3eb2fd95c6`) or the underscore form the dataset
 * uses for folder names (`1d35f140_7cba_5fa4_9bb6_9e3eb2fd95c6`).
 *
 * The cloud dataset identifies entities by a deterministic UUIDv5; local data
 * and folders are named by human-readable slug. A UUID must therefore never
 * appear as a folder name — if one does, a proxy/slug mapping failed and the
 * submission would create a junk `data/<uuid>/...` directory (see the orphaned
 * `data/1d35f140_..._9c6` = uuid5("sunlu")). Reject such segments outright so a
 * bad submission is cleanly skipped instead of corrupting the tree.
 */
export const UUID_SEGMENT =
	/^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i;

/** True if `segment` looks like a UUID (and so must not become a folder name). */
export function isUuidSegment(segment: string): boolean {
	return UUID_SEGMENT.test(segment);
}

/**
 * Identity fields that are never authored in the editor: `uuid` is the canonical
 * id minted by CI on merge, `moved_from` is written by the merge tooling. Both
 * are hidden by every form, which re-attaches them only when the entity it
 * loaded already carried them.
 *
 * A payload can legitimately predate assignment — a `create` staged before the
 * entity was published, or an edit loaded before CI filled the uuid in — and
 * every write here replaces the whole file. Without carrying these over from
 * what is already committed at the target path, such a payload silently drops
 * them, and the post-merge `ofd uuid assign` mints a *new* uuid for what is the
 * same entity, breaking every external reference to it.
 */
export const CANONICAL_IDENTITY_FIELDS = ['uuid', 'moved_from'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when a field actually carries an identity (not missing/blank/empty). */
function hasIdentityValue(value: unknown): boolean {
	if (value === undefined || value === null || value === '') return false;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

/**
 * The `(filament_weight, diameter)` identity used to pair spools across a
 * rewrite. Mirrors `size_dedupe_key` in ofd/merge.py, which is what the Python
 * side uses to pair the same spools — they must not diverge.
 */
function sizeKey(size: Record<string, unknown>): string {
	return JSON.stringify([size.filament_weight ?? null, size.diameter ?? null]);
}

function mergeIdentity(
	incoming: Record<string, unknown>,
	existing: Record<string, unknown>
): Record<string, unknown> {
	const missing = CANONICAL_IDENTITY_FIELDS.some(
		(field) => !hasIdentityValue(incoming[field]) && hasIdentityValue(existing[field])
	);
	if (!missing) return incoming;

	// Canonical fields lead, in schema order — the placement `ofd uuid assign` uses.
	const merged: Record<string, unknown> = {};
	for (const field of CANONICAL_IDENTITY_FIELDS) {
		if (hasIdentityValue(incoming[field])) merged[field] = incoming[field];
		else if (hasIdentityValue(existing[field])) merged[field] = existing[field];
	}
	for (const [key, value] of Object.entries(incoming)) {
		if (!(key in merged)) merged[key] = value;
	}
	return merged;
}

function mergeSizesIdentity(incoming: unknown[], existing: unknown[]): unknown[] {
	const byKey = new Map<string, Record<string, unknown>[]>();
	for (const entry of existing) {
		if (!isPlainObject(entry)) continue;
		const key = sizeKey(entry);
		const bucket = byKey.get(key);
		if (bucket) bucket.push(entry);
		else byKey.set(key, [entry]);
	}

	return incoming.map((entry) => {
		if (!isPlainObject(entry)) return entry;
		// shift(), so two spools sharing a (weight, diameter) key can't both claim
		// the same uuid — the second one is left unassigned for CI instead.
		const match = byKey.get(sizeKey(entry))?.shift();
		return match ? mergeIdentity(entry, match) : entry;
	});
}

/**
 * Carry `CANONICAL_IDENTITY_FIELDS` from the currently committed file (`existing`)
 * onto the data about to replace it, for any the payload doesn't already carry.
 *
 * Handles both an entity object (brand/material/filament/variant/store.json) and
 * a `sizes.json` array, whose spools are paired by `(filament_weight, diameter)`.
 * Returns `incoming` untouched when there is nothing to preserve, when the path
 * is new (`existing` is null), or when the two shapes don't match.
 */
export function preserveCanonicalFields<T>(incoming: T, existing: unknown): T {
	if (Array.isArray(incoming)) {
		return (Array.isArray(existing) ? mergeSizesIdentity(incoming, existing) : incoming) as T;
	}
	if (isPlainObject(incoming) && isPlainObject(existing)) {
		return mergeIdentity(incoming, existing) as T;
	}
	return incoming;
}

/**
 * Fields to strip from entity data before writing to disk.
 * These are internal tracking fields added by the webui.
 */
export const STRIP_FIELDS = new Set([
	'brandId', 'brand_id', 'materialType', 'filamentDir', 'filament_id', 'slug'
]);

/**
 * Per-entity-type strip fields for PR/repo writes.
 * These are more granular than STRIP_FIELDS since repo JSON
 * has different conventions per entity type.
 */
export const STRIP_FIELDS_BY_TYPE: Record<string, Set<string>> = {
	brand: new Set(['slug', 'logo_name', 'logo_slug', 'path']),
	store: new Set(['slug', 'logo_name', 'logo_slug', 'path']),
	material: new Set(['id', 'brandId', 'materialType', 'slug']),
	filament: new Set(['slug', 'brandId', 'materialType', 'filamentDir']),
	variant: new Set(['slug', 'brandId', 'materialType', 'filamentId', 'filament_id', 'variantDir'])
};
const DEFAULT_STRIP_FIELDS = new Set(['brandId', 'materialType', 'filamentDir', 'filament_id', 'filamentId', 'variantDir', 'slug']);

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

	// Reject empty segments, unsafe characters, or UUID-shaped segments (a UUID
	// here means a slug mapping failed; never let it become a folder name).
	for (const part of parts) {
		if (!SAFE_SEGMENT.test(part) || isUuidSegment(part)) return null;
	}

	if (parts[0] === 'stores' && parts.length === 2) {
		return path.join(STORES_DIR, parts[1], 'store.json');
	}

	if (parts[0] === 'brands' && parts.length >= 2) {
		const brandDir = parts[1];
		if (parts.length === 2) {
			return path.join(DATA_DIR, brandDir, 'brand.json');
		}
		if (parts.length === 4 && parts[2] === 'materials') {
			const materialDir = parts[3].toUpperCase();
			return path.join(DATA_DIR, brandDir, materialDir, 'material.json');
		}
		if (parts.length === 6 && parts[2] === 'materials' && parts[4] === 'filaments') {
			const materialDir = parts[3].toUpperCase();
			return path.join(DATA_DIR, brandDir, materialDir, parts[5], 'filament.json');
		}
		if (parts.length === 8 && parts[2] === 'materials' && parts[4] === 'filaments' && parts[6] === 'variants') {
			const materialDir = parts[3].toUpperCase();
			return path.join(DATA_DIR, brandDir, materialDir, parts[5], parts[7], 'variant.json');
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
 * When `options.schemaType` is provided, uses per-type strip fields and
 * applies additional logic for PR/repo writes (image resolution, origin defaults).
 */
export function cleanEntityData(
	data: Record<string, unknown>,
	options?: { imageFilenames?: Map<string, string>; schemaType?: string | null }
): Record<string, unknown> {
	const stripFields = options?.schemaType
		? (STRIP_FIELDS_BY_TYPE[options.schemaType] ?? DEFAULT_STRIP_FIELDS)
		: STRIP_FIELDS;
	const imageFilenames = options?.imageFilenames;

	// For stores/brands: the cloud API uses UUIDs as id and slug-based folder names.
	// Restore repo-format id from slug, and repo-format logo from logo_name.
	let repoId: string | null = null;
	let repoLogo: string | null = null;

	if (options?.schemaType && typeof data.slug === 'string' && data.slug) {
		if (options.schemaType === 'store' || options.schemaType === 'brand') {
			repoId = data.slug as string;
		}
	}

	if ((options?.schemaType === 'store' || options?.schemaType === 'brand') &&
		typeof data.logo_name === 'string' && data.logo_name) {
		repoLogo = data.logo_name;
	}

	const clean: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (stripFields.has(key)) continue;

		// Restore repo-format id from slug
		if (repoId && key === 'id') {
			clean[key] = repoId;
			continue;
		}

		// Resolve image reference IDs to actual filenames (PR writes only)
		if (imageFilenames && key === 'logo' && typeof value === 'string' && imageFilenames.has(value)) {
			clean[key] = imageFilenames.get(value);
			continue;
		}

		// Restore repo-format logo from logo_name
		if (repoLogo && key === 'logo') {
			clean[key] = repoLogo;
			continue;
		}

		// Default required fields that would fail validation if empty (PR writes only)
		if (options?.schemaType && key === 'origin' && (value === '' || value === undefined)) {
			clean[key] = 'Unknown';
			continue;
		}

		if (value === '') continue;
		clean[key] = value;
	}
	return clean;
}
