/**
 * The editor's normalisation of a variant's sizes, shared by every place that reads sizes
 * into the editor: the cloud API client (utils/api.ts), the cloud proxy
 * (server/cloudProxy.ts) and the PR loader (server/prChanges.ts).
 *
 * The size form always emits the same shape, so data read from anywhere else must be put in
 * that shape too, or an untouched size shows up as a change:
 * - the deprecated `spool_refill` (size- and link-level) becomes size-level
 *   `container_material: 'refill'` when it was true, and is dropped either way;
 * - `discontinued` defaults to false;
 * - the cloud dataset's synthetic ids (`id`, `variant_id`, `size_id`) are dropped.
 */

/** Normalise one size. `mapStoreId` rewrites a purchase link's store id (cloud UUID → slug). */
export function normalizeSize(size: any, mapStoreId?: (id: string) => string | undefined): any {
	if (!size || typeof size !== 'object' || Array.isArray(size)) return size;
	const { id: _id, variant_id: _vid, spool_refill: legacySizeRefill, ...rest } = size;
	// OR across links: if any link was a refill, the size is a refill.
	let migratedRefill = legacySizeRefill === true;
	if (Array.isArray(rest.purchase_links)) {
		rest.purchase_links = rest.purchase_links.map((link: any) => {
			if (!link || typeof link !== 'object') return link;
			const { id: _lid, size_id: _sid, spool_refill: legacyRefill, ...linkRest } = link;
			if (legacyRefill === true) migratedRefill = true;
			if (mapStoreId && typeof linkRest.store_id === 'string') {
				const mapped = mapStoreId(linkRest.store_id);
				if (mapped) linkRest.store_id = mapped;
			}
			return linkRest;
		});
	}
	if (migratedRefill && rest.container_material === undefined) rest.container_material = 'refill';
	if (rest.discontinued === undefined) rest.discontinued = false;
	return rest;
}

/** Normalise a sizes list; anything that isn't a list is returned as is. */
export function normalizeSizes(
	sizes: unknown,
	mapStoreId?: (id: string) => string | undefined
): unknown {
	return Array.isArray(sizes) ? sizes.map((s) => normalizeSize(s, mapStoreId)) : sizes;
}
