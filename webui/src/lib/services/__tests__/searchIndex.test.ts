import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityChange } from '$lib/types/changes';
import type { SearchRecord } from '$lib/types/search';

// Mock the API layer so the service's apiFetch import doesn't pull in the
// SvelteKit env/store modules, and we can drive loadSearchIndex directly.
const apiMocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('$lib/utils/api', () => ({ apiFetch: apiMocks.apiFetch }));

import {
	searchRecords,
	layerChanges,
	loadSearchIndex,
	clearSearchCache
} from '../searchIndex';

// --- fixtures -------------------------------------------------------------

const brand: SearchRecord = {
	type: 'brand',
	name: 'Bambu Lab',
	href: '/brands/bambu_lab',
	brandName: 'Bambu Lab',
	brandSlug: 'bambu_lab',
	keywords: 'cn',
	path: 'brands/bambu_lab'
};
const material: SearchRecord = {
	type: 'material',
	name: 'PLA',
	href: '/brands/bambu_lab/PLA',
	brandName: 'Bambu Lab',
	brandSlug: 'bambu_lab',
	materialType: 'PLA',
	keywords: 'pla',
	path: 'brands/bambu_lab/materials/PLA'
};
const filamentBasic: SearchRecord = {
	type: 'filament',
	name: 'PLA Basic',
	href: '/brands/bambu_lab/PLA/pla_basic',
	brandName: 'Bambu Lab',
	brandSlug: 'bambu_lab',
	materialType: 'PLA',
	path: 'brands/bambu_lab/materials/PLA/filaments/pla_basic'
};
const filamentMatte: SearchRecord = {
	type: 'filament',
	name: 'PLA Matte',
	href: '/brands/bambu_lab/PLA/pla_matte',
	brandName: 'Bambu Lab',
	brandSlug: 'bambu_lab',
	materialType: 'PLA',
	path: 'brands/bambu_lab/materials/PLA/filaments/pla_matte'
};
const store: SearchRecord = {
	type: 'store',
	name: 'Bambu Store',
	href: '/stores/bambu_store',
	keywords: 'https://store.bambulab.com',
	path: 'stores/bambu_store'
};

const ALL = [brand, material, filamentBasic, filamentMatte, store];

function change(
	type: EntityChange['entity']['type'],
	path: string,
	operation: EntityChange['operation'],
	data?: any,
	originalData?: any
): EntityChange {
	return {
		entity: { type, path, id: path.split('/').pop()! },
		operation,
		data,
		originalData,
		timestamp: 0
	} as EntityChange;
}

// --- searchRecords --------------------------------------------------------

describe('searchRecords', () => {
	it('returns no results for an empty query', () => {
		const r = searchRecords(ALL, '   ');
		expect(r.total).toBe(0);
		expect(r.results).toEqual([]);
		expect(r.pageCount).toBe(1);
	});

	it('matches case-insensitively across name/brand/keywords', () => {
		const r = searchRecords(ALL, 'bambu');
		// brand, store, and the brand-context records all contain "bambu"
		expect(r.results.map((x) => x.path)).toContain('brands/bambu_lab');
		expect(r.results.map((x) => x.path)).toContain('stores/bambu_store');
		expect(r.total).toBe(ALL.length); // every record carries "Bambu Lab" brand context except store which has it in name
	});

	it('applies AND semantics across whitespace-separated terms', () => {
		const r = searchRecords(ALL, 'pla matte');
		expect(r.results.map((x) => x.path)).toEqual(['brands/bambu_lab/materials/PLA/filaments/pla_matte']);
	});

	it('filters by type', () => {
		const r = searchRecords(ALL, 'pla', { types: ['filament'] });
		expect(r.results.every((x) => x.type === 'filament')).toBe(true);
		expect(r.total).toBe(2);
	});

	it('ranks exact name match above startsWith above contains, then by type', () => {
		const r = searchRecords(ALL, 'pla');
		// "PLA" material is an exact name match → first.
		expect(r.results[0].path).toBe('brands/bambu_lab/materials/PLA');
	});

	it('paginates and clamps out-of-range pages', () => {
		const many: SearchRecord[] = Array.from({ length: 30 }, (_, i) => ({
			type: 'filament',
			name: `PLA ${i}`,
			href: `/brands/b/PLA/f${i}`,
			path: `brands/b/materials/PLA/filaments/f${i}`
		}));
		const page1 = searchRecords(many, 'pla', { page: 1, pageSize: 24 });
		expect(page1.results).toHaveLength(24);
		expect(page1.pageCount).toBe(2);

		const page2 = searchRecords(many, 'pla', { page: 2, pageSize: 24 });
		expect(page2.results).toHaveLength(6);

		const clamped = searchRecords(many, 'pla', { page: 99, pageSize: 24 });
		expect(clamped.page).toBe(2);
		expect(clamped.results).toHaveLength(6);
	});
});

// --- layerChanges ---------------------------------------------------------

describe('layerChanges', () => {
	it('returns the base unchanged when there are no changes', () => {
		expect(layerChanges(ALL, [])).toBe(ALL);
	});

	it('adds a locally created filament', () => {
		const create = change(
			'filament',
			'brands/bambu_lab/materials/PLA/filaments/pla_silk',
			'create',
			{ name: 'PLA Silk' }
		);
		const layered = layerChanges(ALL, [create]);
		const rec = layered.find((r) => r.path.endsWith('filaments/pla_silk'));
		expect(rec).toBeDefined();
		expect(rec!.name).toBe('PLA Silk');
		expect(rec!.href).toBe('/brands/bambu_lab/PLA/pla_silk');
		expect(rec!.brandName).toBe('Bambu Lab');
	});

	it('updates an existing record in place', () => {
		const update = change(
			'filament',
			'brands/bambu_lab/materials/PLA/filaments/pla_basic',
			'update',
			{ name: 'PLA Basic v2' },
			{ name: 'PLA Basic', slug: 'pla_basic', id: 'pla_basic' }
		);
		const layered = layerChanges(ALL, [update]);
		const rec = layered.find((r) => r.path.endsWith('filaments/pla_basic'));
		expect(rec!.name).toBe('PLA Basic v2');
		// no duplicate
		expect(layered.filter((r) => r.path.endsWith('filaments/pla_basic'))).toHaveLength(1);
	});

	it('drops the stale record when a brand is renamed', () => {
		const rename = change('brand', 'brands/bambu', 'update', { name: 'Bambu' }, {
			slug: 'bambu_lab',
			id: 'bambu_lab',
			name: 'Bambu Lab'
		});
		const layered = layerChanges(ALL, [rename]);
		expect(layered.find((r) => r.path === 'brands/bambu_lab')).toBeUndefined();
		expect(layered.find((r) => r.path === 'brands/bambu')).toBeDefined();
	});

	it('cascades a delete to descendants', () => {
		const del = change('brand', 'brands/bambu_lab', 'delete');
		const layered = layerChanges(ALL, [del]);
		expect(layered.some((r) => r.path.startsWith('brands/bambu_lab'))).toBe(false);
		// unrelated store survives
		expect(layered.some((r) => r.path === 'stores/bambu_store')).toBe(true);
	});

	it('lets pending changes win over submitted', () => {
		const submitted = change(
			'filament',
			'brands/bambu_lab/materials/PLA/filaments/pla_basic',
			'update',
			{ name: 'Submitted name' },
			{ name: 'PLA Basic', slug: 'pla_basic', id: 'pla_basic' }
		);
		const pending = change(
			'filament',
			'brands/bambu_lab/materials/PLA/filaments/pla_basic',
			'update',
			{ name: 'Pending name' },
			{ name: 'PLA Basic', slug: 'pla_basic', id: 'pla_basic' }
		);
		const layered = layerChanges(ALL, [pending], [submitted]);
		const rec = layered.find((r) => r.path.endsWith('filaments/pla_basic'));
		expect(rec!.name).toBe('Pending name');
	});

	it('ignores variant changes (not indexed)', () => {
		const variant = change(
			'variant',
			'brands/bambu_lab/materials/PLA/filaments/pla_basic/variants/black',
			'create',
			{ name: 'Black' }
		);
		const layered = layerChanges(ALL, [variant]);
		expect(layered.some((r) => r.path.includes('/variants/'))).toBe(false);
	});

	// Cloud index paths are lowercase slugs; change paths can be uppercase (local
	// dir). Layering must dedupe across that case difference — no stale duplicates.
	const cloudMaterialBase: SearchRecord[] = [
		{
			type: 'material',
			name: 'PLA',
			href: '/brands/b/pla',
			brandName: 'B',
			brandSlug: 'b',
			materialType: 'PLA',
			path: 'brands/b/materials/pla'
		}
	];

	it('removes the stale lowercase base record when a material is renamed', () => {
		const rename = change(
			'material',
			'brands/b/materials/pla_plus',
			'update',
			{ material: 'PLA+' },
			{ material: 'PLA', materialType: 'PLA' }
		);
		const layered = layerChanges(cloudMaterialBase, [rename]);
		expect(layered.map((r) => r.path)).toEqual(['brands/b/materials/pla_plus']);
	});

	it('dedupes an in-place material edit whose change path differs only in case', () => {
		const edit = change(
			'material',
			'brands/b/materials/PLA',
			'update',
			{ material: 'PLA' },
			{ material: 'PLA', materialType: 'PLA' }
		);
		const layered = layerChanges(cloudMaterialBase, [edit]);
		expect(layered).toHaveLength(1);
	});
});

// --- loadSearchIndex ------------------------------------------------------

describe('loadSearchIndex', () => {
	beforeEach(() => {
		clearSearchCache();
		apiMocks.apiFetch.mockReset();
	});

	it('fetches, unwraps records, and caches', async () => {
		apiMocks.apiFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ count: 1, records: [brand] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		const first = await loadSearchIndex();
		expect(first).toEqual([brand]);

		// second call is served from cache — no extra fetch
		const second = await loadSearchIndex();
		expect(second).toBe(first);
		expect(apiMocks.apiFetch).toHaveBeenCalledTimes(1);
	});
});
