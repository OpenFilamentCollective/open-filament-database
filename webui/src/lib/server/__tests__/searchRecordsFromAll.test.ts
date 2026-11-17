import { describe, it, expect } from 'vitest';
import { buildSearchRecordsFromAll } from '../searchRecordsFromAll';

describe('buildSearchRecordsFromAll', () => {
	const all = {
		brands: [{ id: 'b1', name: 'Bambu Lab', slug: 'bambu_lab', origin: 'CN', website: 'https://bambulab.com' }],
		materials: [{ id: 'm1', brand_id: 'b1', material: 'PLA', slug: 'pla' }],
		filaments: [{ id: 'f1', material_id: 'm1', brand_id: 'b1', name: 'PLA Basic', slug: 'pla_basic' }],
		stores: [{ id: 's1', name: 'Bambu Store', slug: 'bambu_store', storefront_url: 'https://store.bambulab.com', ships_from: 'CN', ships_to: [] }]
	};

	it('builds one record per brand/material/filament/store with cloud slug hrefs', () => {
		const records = buildSearchRecordsFromAll(all);
		expect(records).toHaveLength(4);
		const byPath = Object.fromEntries(records.map((r) => [r.path, r]));

		expect(byPath['brands/bambu_lab'].href).toBe('/brands/bambu_lab');
		expect(byPath['brands/bambu_lab/materials/pla'].href).toBe('/brands/bambu_lab/pla');
		expect(byPath['brands/bambu_lab/materials/pla'].materialType).toBe('PLA');
		expect(byPath['brands/bambu_lab/materials/pla/filaments/pla_basic'].href).toBe(
			'/brands/bambu_lab/pla/pla_basic'
		);
		expect(byPath['stores/bambu_store'].href).toBe('/stores/bambu_store');
	});

	it('skips children whose parent is missing and tolerates empty input', () => {
		expect(buildSearchRecordsFromAll({})).toEqual([]);
		const orphaned = buildSearchRecordsFromAll({
			materials: [{ id: 'm1', brand_id: 'ghost', material: 'PLA', slug: 'pla' }]
		});
		expect(orphaned).toEqual([]);
	});
});
