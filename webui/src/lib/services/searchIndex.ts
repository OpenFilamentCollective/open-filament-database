import type { EntityChange } from '$lib/types/changes';
import type {
	SearchRecord,
	SearchEntityType,
	SearchResult,
	SearchIndexFile,
	GtinIndexFile
} from '$lib/types/search';
import { apiFetch, apiError } from '$lib/utils/api';
import { normalizeGtin, looksLikeBarcode } from '$lib/utils/gtin';
import { parsePath } from '$lib/utils/changePaths';

/**
 * Global search service.
 *
 * Loads the flat search index once (from /api/search-index — a local fs walk in
 * local mode, the static CDN file in cloud mode), then matches + ranks +
 * paginates entirely client-side. The contributor's staged edits are layered on
 * top via {@link layerChanges} so locally created/renamed/deleted entities still
 * appear in search.
 *
 * Barcodes are handled separately. The name index carries no variants or sizes, so a
 * scanned GTIN/EAN/UPC is resolved against a second file (/api/gtin-index) that is
 * only fetched when a query actually looks like a barcode — it is a few hundred KB,
 * and an ordinary name search must not pay for it (#479).
 */

// ============================================
// Index loading (singleton + in-flight dedupe)
// ============================================

let indexCache: SearchRecord[] | null = null;
let indexPromise: Promise<SearchRecord[]> | null = null;

export async function loadSearchIndex(): Promise<SearchRecord[]> {
	if (indexCache) return indexCache;
	if (indexPromise) return indexPromise;

	indexPromise = (async () => {
		try {
			const response = await apiFetch('/api/search-index');
			if (!response.ok) throw await apiError(response, 'Failed to load search index');
			const data: SearchIndexFile = await response.json();
			indexCache = Array.isArray(data?.records) ? data.records : [];
			return indexCache;
		} finally {
			indexPromise = null;
		}
	})();

	return indexPromise;
}

let gtinCache: GtinIndexFile | null = null;
let gtinPromise: Promise<GtinIndexFile> | null = null;

/**
 * Load the barcode index. Separate from {@link loadSearchIndex} and lazy on purpose:
 * call it only when {@link looksLikeBarcode} says the query warrants it.
 */
export async function loadGtinIndex(): Promise<GtinIndexFile> {
	if (gtinCache) return gtinCache;
	if (gtinPromise) return gtinPromise;

	gtinPromise = (async () => {
		try {
			const response = await apiFetch('/api/gtin-index');
			if (!response.ok) throw await apiError(response, 'Failed to load barcode index');
			const data: GtinIndexFile = await response.json();
			gtinCache = data?.codes ? data : { count: 0, codes: {} };
			return gtinCache;
		} finally {
			gtinPromise = null;
		}
	})();

	return gtinPromise;
}

export function clearSearchCache(): void {
	indexCache = null;
	indexPromise = null;
	gtinCache = null;
	gtinPromise = null;
}

/**
 * Variant records for a barcode query, or `[]` when it isn't one / doesn't match.
 *
 * A code can cover more than one size (a spool and its refill), and those may sit on
 * different variants, so this can legitimately return several records; duplicates
 * pointing at the same variant are collapsed since the extra sizes add nothing to a
 * result list.
 */
export function gtinRecordsFor(index: GtinIndexFile | null, query: string): SearchRecord[] {
	const code = looksLikeBarcode(query) ? normalizeGtin(query) : null;
	if (!code || !index?.codes) return [];

	const seen = new Set<string>();
	const records: SearchRecord[] = [];
	for (const entry of index.codes[code] ?? []) {
		const path = `brands/${entry.brand_slug}/materials/${entry.material_slug}/filaments/${entry.filament_slug}/variants/${entry.variant_slug}`;
		if (seen.has(path)) continue;
		seen.add(path);
		records.push({
			type: 'variant',
			name: entry.variant_name,
			href: `/brands/${entry.brand_slug}/${entry.material_slug}/${entry.filament_slug}/${entry.variant_slug}`,
			brandName: entry.brand_name,
			brandSlug: entry.brand_slug,
			materialType: entry.material_slug,
			filamentName: entry.filament_name,
			gtin: entry.gtin,
			// Both spellings, so the record matches whether the user typed the code as
			// stored or in its padded 14-digit form.
			keywords: `${entry.filament_name} ${entry.gtin} ${code}`,
			path
		});
	}
	return records;
}

// ============================================
// Matching + ranking
// ============================================

/** Types this service indexes, in display/tie-break priority order. */
const TYPE_PRIORITY: Record<SearchEntityType, number> = {
	brand: 0,
	material: 1,
	filament: 2,
	// Variants only ever reach a result list via an exact barcode match, which the
	// caller prepends — this rank only settles ties among them.
	variant: 3,
	store: 4
};

const COVERED_TYPES = new Set<SearchEntityType>([
	'brand',
	'store',
	'material',
	'filament',
	'variant'
]);

function haystack(r: SearchRecord): string {
	return `${r.name} ${r.brandName ?? ''} ${r.materialType ?? ''} ${r.keywords ?? ''}`.toLowerCase();
}

/** A record matches when every whitespace-separated term is a substring of its haystack. */
function matches(r: SearchRecord, terms: string[]): boolean {
	const hay = haystack(r);
	return terms.every((t) => hay.includes(t));
}

/** Lower score sorts first. Barcode hit → exact name → startsWith → contains → other. */
function rankScore(r: SearchRecord, firstTerm: string): number {
	// A barcode is an exact product identifier; nothing matched by name should
	// outrank it. Only records from the GTIN index carry `gtin`.
	if (r.gtin) return -1;
	const name = r.name.toLowerCase();
	if (name === firstTerm) return 0;
	if (name.startsWith(firstTerm)) return 1;
	if (name.includes(firstTerm)) return 2;
	return 3;
}

function compareRecords(a: SearchRecord, b: SearchRecord, firstTerm: string): number {
	const sa = rankScore(a, firstTerm);
	const sb = rankScore(b, firstTerm);
	if (sa !== sb) return sa - sb;
	const pa = TYPE_PRIORITY[a.type];
	const pb = TYPE_PRIORITY[b.type];
	if (pa !== pb) return pa - pb;
	return a.name.localeCompare(b.name);
}

export interface SearchOptions {
	page?: number;
	pageSize?: number;
	/** Restrict to these entity types (empty/undefined = all covered types). */
	types?: SearchEntityType[];
}

/**
 * Pure search over a record set. Returns the requested page plus paging metadata.
 * An empty/whitespace query yields no results (the page shows a prompt instead).
 */
export function searchRecords(
	records: SearchRecord[],
	query: string,
	options: SearchOptions = {}
): SearchResult {
	const { page = 1, pageSize = 24, types } = options;
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	const typeFilter = types && types.length > 0 ? new Set(types) : null;

	if (terms.length === 0) {
		return { results: [], total: 0, page: 1, pageCount: 1 };
	}

	const firstTerm = terms[0];
	const matched = records
		.filter((r) => (!typeFilter || typeFilter.has(r.type)) && matches(r, terms))
		.sort((a, b) => compareRecords(a, b, firstTerm));

	const total = matched.length;
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const clampedPage = Math.min(Math.max(1, page), pageCount);
	const start = (clampedPage - 1) * pageSize;
	const results = matched.slice(start, start + pageSize);

	return { results, total, page: clampedPage, pageCount };
}

// ============================================
// Change layering (contributor mode)
// ============================================

/** Build a SearchRecord from a tracked change. Returns null for uncovered types. */
function recordFromChange(change: EntityChange, brandNameFor: (slug: string) => string): SearchRecord | null {
	const ep = parsePath(change.entity.path);
	if (!ep) return null;
	const data: Record<string, any> = change.data ?? {};

	switch (ep.type) {
		case 'brand': {
			const name = data.name ?? ep.brandId;
			return {
				type: 'brand',
				name,
				href: `/brands/${ep.brandId}`,
				brandName: name,
				brandSlug: ep.brandId,
				logo: data.logo || undefined,
				keywords: [data.origin, data.website].filter(Boolean).join(' '),
				path: change.entity.path
			};
		}
		case 'store': {
			const name = data.name ?? ep.storeId;
			return {
				type: 'store',
				name,
				href: `/stores/${ep.storeId}`,
				logo: data.logo || undefined,
				keywords: [data.storefront_url].filter(Boolean).join(' '),
				path: change.entity.path
			};
		}
		case 'material':
			return {
				type: 'material',
				name: data.material ?? ep.materialType,
				href: `/brands/${ep.brandId}/${ep.materialType}`,
				brandName: brandNameFor(ep.brandId),
				brandSlug: ep.brandId,
				materialType: ep.materialType,
				keywords: data.material ?? '',
				path: change.entity.path
			};
		case 'filament':
			return {
				type: 'filament',
				name: data.name ?? ep.filamentId,
				href: `/brands/${ep.brandId}/${ep.materialType}/${ep.filamentId}`,
				brandName: brandNameFor(ep.brandId),
				brandSlug: ep.brandId,
				materialType: ep.materialType,
				keywords: data.name ?? '',
				path: change.entity.path
			};
		default:
			return null; // variant — not indexed
	}
}

/** Compute the pre-rename path of an updated entity, so its stale base record can be dropped. */
function originalPath(change: EntityChange): string | null {
	const ep = parsePath(change.entity.path);
	const o = change.originalData as Record<string, any> | undefined;
	if (!ep || !o) return null;
	switch (ep.type) {
		case 'brand':
			return `brands/${o.slug ?? o.id ?? ep.brandId}`;
		case 'store':
			return `stores/${o.slug ?? o.id ?? ep.storeId}`;
		case 'material': {
			// Keep the original casing — paths are matched case-insensitively below,
			// since material segments are uppercase on disk (local) but lowercase
			// slugs in the cloud index.
			const mt = (o.materialType ?? o.material ?? ep.materialType).toString();
			return `brands/${ep.brandId}/materials/${mt}`;
		}
		case 'filament':
			return `brands/${ep.brandId}/materials/${ep.materialType}/filaments/${o.slug ?? o.id ?? ep.filamentId}`;
		default:
			return null;
	}
}

function deleteWithDescendants(map: Map<string, SearchRecord>, path: string): void {
	const prefix = `${path.toLowerCase()}/`;
	for (const key of map.keys()) {
		if (key === path.toLowerCase() || key.startsWith(prefix)) map.delete(key);
	}
}

function applyChange(map: Map<string, SearchRecord>, change: EntityChange): void {
	if (!COVERED_TYPES.has(change.entity.type as SearchEntityType)) return;

	if (change.operation === 'delete') {
		deleteWithDescendants(map, change.entity.path);
		return;
	}

	// create / update
	const brandNameFor = (slug: string) => {
		const b = map.get(`brands/${slug}`.toLowerCase());
		return b?.brandName ?? b?.name ?? slug;
	};
	const record = recordFromChange(change, brandNameFor);
	if (!record) return;

	// Renames move the change-tree path; drop the now-stale base record at the old
	// path. Match case-insensitively, since the base record's material segment may
	// be lowercase (cloud slug) while the change path is uppercase (local dir).
	if (change.operation === 'update') {
		const old = originalPath(change);
		if (old && old.toLowerCase() !== record.path.toLowerCase()) map.delete(old.toLowerCase());
	}

	map.set(record.path.toLowerCase(), record);
}

/**
 * Layer staged edits over the base index. Precedence: base < submitted < pending,
 * so submitted changes are applied first and pending changes win.
 * Pure: callers pass the change lists (keeps Svelte reactivity explicit).
 */
export function layerChanges(
	base: SearchRecord[],
	pendingChanges: EntityChange[],
	submittedChanges: EntityChange[] = []
): SearchRecord[] {
	if (pendingChanges.length === 0 && submittedChanges.length === 0) return base;

	// Keyed by lowercased path so base records and staged changes dedupe even when
	// their material segments differ in case (uppercase dir vs lowercase slug).
	const map = new Map<string, SearchRecord>();
	for (const r of base) map.set(r.path.toLowerCase(), r);

	for (const c of submittedChanges) applyChange(map, c);
	for (const c of pendingChanges) applyChange(map, c);

	return Array.from(map.values());
}
