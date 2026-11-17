import type { SearchRecord } from '$lib/types/search';

/**
 * Build the flat search index from the cloud `json/all.json` aggregate.
 *
 * Used as a cloud-mode fallback when the dedicated /api/v1/search-index.json
 * isn't on the CDN yet (e.g. before the next `python -m ofd build` runs). The
 * aggregate already exists on the CDN, so this keeps global search working with
 * no dataset rebuild. Hrefs use the same lowercase `slug` segments the cloud
 * static files use, matching the Python search-index exporter.
 *
 * Logos are intentionally omitted: all.json carries `logo_name` (the raw
 * filename) rather than the CDN `logo_slug`, so cards fall back to initials
 * until the dedicated index (which has logo slugs) is published.
 */
interface AllJson {
	brands?: Array<Record<string, any>>;
	materials?: Array<Record<string, any>>;
	filaments?: Array<Record<string, any>>;
	stores?: Array<Record<string, any>>;
}

function joinKeywords(...values: unknown[]): string {
	const parts: string[] = [];
	for (const v of values) {
		if (v == null || v === '') continue;
		if (Array.isArray(v)) parts.push(...v.filter(Boolean).map(String));
		else parts.push(String(v));
	}
	return parts.join(' ');
}

export function buildSearchRecordsFromAll(all: AllJson): SearchRecord[] {
	const brands = all.brands ?? [];
	const materials = all.materials ?? [];
	const filaments = all.filaments ?? [];
	const stores = all.stores ?? [];

	const brandById = new Map(brands.map((b) => [b.id, b]));
	const materialById = new Map(materials.map((m) => [m.id, m]));

	const records: SearchRecord[] = [];

	for (const b of brands) {
		records.push({
			type: 'brand',
			name: b.name,
			href: `/brands/${b.slug}`,
			brandName: b.name,
			brandSlug: b.slug,
			keywords: joinKeywords(b.origin, b.website),
			path: `brands/${b.slug}`
		});
	}

	for (const m of materials) {
		const b = brandById.get(m.brand_id);
		if (!b) continue;
		records.push({
			type: 'material',
			name: m.material,
			href: `/brands/${b.slug}/${m.slug}`,
			brandName: b.name,
			brandSlug: b.slug,
			materialType: m.material,
			keywords: joinKeywords(m.material),
			path: `brands/${b.slug}/materials/${m.slug}`
		});
	}

	for (const f of filaments) {
		const m = materialById.get(f.material_id);
		if (!m) continue;
		const b = brandById.get(m.brand_id);
		if (!b) continue;
		records.push({
			type: 'filament',
			name: f.name,
			href: `/brands/${b.slug}/${m.slug}/${f.slug}`,
			brandName: b.name,
			brandSlug: b.slug,
			materialType: m.material,
			keywords: joinKeywords(f.name),
			path: `brands/${b.slug}/materials/${m.slug}/filaments/${f.slug}`
		});
	}

	for (const s of stores) {
		records.push({
			type: 'store',
			name: s.name,
			href: `/stores/${s.slug}`,
			keywords: joinKeywords(s.storefront_url, s.ships_from, s.ships_to),
			path: `stores/${s.slug}`
		});
	}

	return records;
}
