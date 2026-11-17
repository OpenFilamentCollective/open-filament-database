import { describe, it, expect } from 'vitest';
import { gtinRecordsFor, searchRecords } from '../searchIndex';
import type { GtinIndexFile, GtinEntry, SearchRecord } from '$lib/types/search';

const entry = (over: Partial<GtinEntry> = {}): GtinEntry => ({
	gtin: '6938936710103',
	brand_name: 'Polymaker',
	brand_slug: 'polymaker',
	material_slug: 'PETG',
	filament_name: 'Polylite PETG',
	filament_slug: 'polylite_petg',
	variant_name: 'Purple',
	variant_slug: 'purple',
	filament_weight: 1000,
	diameter: 1.75,
	href: 'brands/polymaker/materials/PETG/filaments/polylite_petg/variants/purple.json',
	...over
});

const index: GtinIndexFile = {
	count: 1,
	codes: { '06938936710103': [entry()] }
};

describe('gtinRecordsFor', () => {
	it('resolves a scanned code to a linkable variant record', () => {
		const [record] = gtinRecordsFor(index, '6938936710103');
		expect(record).toMatchObject({
			type: 'variant',
			name: 'Purple',
			href: '/brands/polymaker/PETG/polylite_petg/purple',
			gtin: '6938936710103',
			// A shared code can land on two filaments of one brand, so the colour name
			// alone would make the two results indistinguishable.
			filamentName: 'Polylite PETG',
			path: 'brands/polymaker/materials/PETG/filaments/polylite_petg/variants/purple'
		});
	});

	it('finds the same product however the code was typed', () => {
		// The point of the 14-digit key: a UPC-A, an EAN-13 and a GTIN-14 are one code.
		for (const typed of ['6938936710103', '06938936710103', '693 8936 710103']) {
			expect(gtinRecordsFor(index, typed)).toHaveLength(1);
		}
	});

	it('returns every variant sharing a code', () => {
		// 88 codes in the real tree cover more than one size, sometimes on different variants.
		const shared: GtinIndexFile = {
			count: 1,
			codes: {
				'06938936710103': [entry(), entry({ variant_slug: 'violet', variant_name: 'Violet' })]
			}
		};
		expect(gtinRecordsFor(shared, '6938936710103').map((r) => r.name)).toEqual([
			'Purple',
			'Violet'
		]);
	});

	it('collapses extra sizes on one variant to a single result', () => {
		const twoSizes: GtinIndexFile = {
			count: 1,
			codes: { '06938936710103': [entry(), entry({ filament_weight: 750 })] }
		};
		expect(gtinRecordsFor(twoSizes, '6938936710103')).toHaveLength(1);
	});

	it('is silent for a non-barcode query, an unknown code, or no index', () => {
		expect(gtinRecordsFor(index, 'hyper petg')).toEqual([]);
		expect(gtinRecordsFor(index, '5901234123457')).toEqual([]);
		expect(gtinRecordsFor(null, '6938936710103')).toEqual([]);
	});
});

describe('barcode results in the ranked list', () => {
	const nameRecord: SearchRecord = {
		type: 'filament',
		name: '6938936710103',
		href: '/brands/x/PLA/y',
		path: 'brands/x/materials/PLA/filaments/y'
	};

	it('outranks a name that happens to contain the digits', () => {
		const hits = gtinRecordsFor(index, '6938936710103');
		const { results } = searchRecords([...hits, nameRecord], '6938936710103');
		expect(results.map((r) => r.type)).toEqual(['variant', 'filament']);
	});

	it('matches whichever spelling the user typed', () => {
		const hits = gtinRecordsFor(index, '06938936710103');
		const { results } = searchRecords(hits, '06938936710103');
		expect(results).toHaveLength(1);
	});
});
