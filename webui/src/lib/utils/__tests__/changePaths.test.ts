import { describe, it, expect } from 'vitest';
import {
	buildPath,
	parsePath,
	getTreeSegments,
	getParentPath,
	toEntityIdentifier,
	childNamespace
} from '../changePaths';
import type { EntityPath } from '$lib/types/changeTree';

describe('buildPath', () => {
	it('should build store path', () => {
		expect(buildPath({ type: 'store', storeId: 'amazon' })).toBe('stores/amazon');
	});

	it('should build brand path', () => {
		expect(buildPath({ type: 'brand', brandId: 'prusament' })).toBe('brands/prusament');
	});

	it('should build material path', () => {
		expect(buildPath({ type: 'material', brandId: 'prusament', materialType: 'PLA' })).toBe(
			'brands/prusament/materials/PLA'
		);
	});

	it('should build filament path', () => {
		expect(
			buildPath({
				type: 'filament',
				brandId: 'prusament',
				materialType: 'PLA',
				filamentId: 'pla-basic'
			})
		).toBe('brands/prusament/materials/PLA/filaments/pla-basic');
	});

	it('should build variant path', () => {
		expect(
			buildPath({
				type: 'variant',
				brandId: 'prusament',
				materialType: 'PLA',
				filamentId: 'pla-basic',
				variantSlug: 'red'
			})
		).toBe('brands/prusament/materials/PLA/filaments/pla-basic/variants/red');
	});
});

describe('parsePath', () => {
	it('should parse store path', () => {
		expect(parsePath('stores/amazon')).toEqual({ type: 'store', storeId: 'amazon' });
	});

	it('should parse brand path', () => {
		expect(parsePath('brands/prusament')).toEqual({ type: 'brand', brandId: 'prusament' });
	});

	it('should parse material path', () => {
		expect(parsePath('brands/prusament/materials/PLA')).toEqual({
			type: 'material',
			brandId: 'prusament',
			materialType: 'PLA'
		});
	});

	it('should parse filament path', () => {
		expect(parsePath('brands/prusament/materials/PLA/filaments/pla-basic')).toEqual({
			type: 'filament',
			brandId: 'prusament',
			materialType: 'PLA',
			filamentId: 'pla-basic'
		});
	});

	it('should parse variant path', () => {
		expect(
			parsePath('brands/prusament/materials/PLA/filaments/pla-basic/variants/red')
		).toEqual({
			type: 'variant',
			brandId: 'prusament',
			materialType: 'PLA',
			filamentId: 'pla-basic',
			variantSlug: 'red'
		});
	});

	it('should return null for invalid paths', () => {
		expect(parsePath('')).toBeNull();
		expect(parsePath('unknown/path')).toBeNull();
		expect(parsePath('brands')).toBeNull();
		expect(parsePath('brands/x/invalid/y')).toBeNull();
		expect(parsePath('brands/x/materials')).toBeNull();
	});

	it('should roundtrip with buildPath for all entity types', () => {
		const paths: EntityPath[] = [
			{ type: 'store', storeId: 'test' },
			{ type: 'brand', brandId: 'test' },
			{ type: 'material', brandId: 'b', materialType: 'PLA' },
			{ type: 'filament', brandId: 'b', materialType: 'PLA', filamentId: 'f' },
			{ type: 'variant', brandId: 'b', materialType: 'PLA', filamentId: 'f', variantSlug: 'v' }
		];

		for (const ep of paths) {
			const str = buildPath(ep);
			const parsed = parsePath(str);
			expect(parsed).toEqual(ep);
		}
	});
});

describe('getTreeSegments', () => {
	it('should return segments for store', () => {
		expect(getTreeSegments({ type: 'store', storeId: 'amazon' })).toEqual({
			root: 'stores',
			segments: ['amazon']
		});
	});

	it('should return segments for brand', () => {
		expect(getTreeSegments({ type: 'brand', brandId: 'prusament' })).toEqual({
			root: 'brands',
			segments: ['prusament']
		});
	});

	it('should include namespace segments for material', () => {
		expect(
			getTreeSegments({ type: 'material', brandId: 'prusament', materialType: 'PLA' })
		).toEqual({
			root: 'brands',
			segments: ['prusament', 'materials', 'PLA']
		});
	});

	it('should include namespace segments for filament', () => {
		expect(
			getTreeSegments({
				type: 'filament',
				brandId: 'prusament',
				materialType: 'PLA',
				filamentId: 'basic'
			})
		).toEqual({
			root: 'brands',
			segments: ['prusament', 'materials', 'PLA', 'filaments', 'basic']
		});
	});

	it('should include namespace segments for variant', () => {
		expect(
			getTreeSegments({
				type: 'variant',
				brandId: 'b',
				materialType: 'PLA',
				filamentId: 'f',
				variantSlug: 'red'
			})
		).toEqual({
			root: 'brands',
			segments: ['b', 'materials', 'PLA', 'filaments', 'f', 'variants', 'red']
		});
	});
});

describe('getParentPath', () => {
	it('should return null for store', () => {
		expect(getParentPath({ type: 'store', storeId: 'x' })).toBeNull();
	});

	it('should return null for brand', () => {
		expect(getParentPath({ type: 'brand', brandId: 'x' })).toBeNull();
	});

	it('should return brand for material', () => {
		expect(getParentPath({ type: 'material', brandId: 'b', materialType: 'PLA' })).toEqual({
			type: 'brand',
			brandId: 'b'
		});
	});

	it('should return material for filament', () => {
		expect(
			getParentPath({ type: 'filament', brandId: 'b', materialType: 'PLA', filamentId: 'f' })
		).toEqual({
			type: 'material',
			brandId: 'b',
			materialType: 'PLA'
		});
	});

	it('should return filament for variant', () => {
		expect(
			getParentPath({
				type: 'variant',
				brandId: 'b',
				materialType: 'PLA',
				filamentId: 'f',
				variantSlug: 'v'
			})
		).toEqual({
			type: 'filament',
			brandId: 'b',
			materialType: 'PLA',
			filamentId: 'f'
		});
	});
});

describe('toEntityIdentifier', () => {
	it('should build identifier for store', () => {
		const ep: EntityPath = { type: 'store', storeId: 'amazon' };
		expect(toEntityIdentifier(ep)).toEqual({
			type: 'store',
			path: 'stores/amazon',
			id: 'amazon'
		});
	});

	it('should build identifier for material', () => {
		const ep: EntityPath = { type: 'material', brandId: 'b', materialType: 'PLA' };
		expect(toEntityIdentifier(ep)).toEqual({
			type: 'material',
			path: 'brands/b/materials/PLA',
			id: 'PLA'
		});
	});
});

describe('childNamespace', () => {
	it('should return correct namespaces', () => {
		expect(childNamespace('material')).toBe('materials');
		expect(childNamespace('filament')).toBe('filaments');
		expect(childNamespace('variant')).toBe('variants');
	});
});
