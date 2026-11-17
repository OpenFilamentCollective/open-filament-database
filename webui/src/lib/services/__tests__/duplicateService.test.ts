/**
 * Tests for the duplicate service. This service handles two related flows:
 *
 *  1. Loading children into nested clipboard structures (copy)
 *  2. Pasting children from clipboard under a new parent
 *  3. Duplicating children directly via DB calls
 *
 * The recursive nature (brand → materials → filaments → variants) means a
 * regression here can corrupt nested copies in subtle ways, so we cover
 * each load/paste/duplicate path with an end-to-end mock-DB scenario.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist all dependencies the service touches.
const dbMock = vi.hoisted(() => ({
	loadMaterials: vi.fn(),
	loadFilaments: vi.fn(),
	loadVariants: vi.fn(),
	createMaterial: vi.fn(),
	createFilament: vi.fn(),
	createVariant: vi.fn()
}));

// prepareEntityData strips identity fields. Use a passthrough that mimics
// the real strip behavior (id removed, name suffix appended) so we can
// assert it's being called correctly.
const prepareEntityDataMock = vi.hoisted(() =>
	vi.fn((_type: string, data: any, suffix?: string) => {
		const out = { ...data };
		delete out.id;
		delete out.slug;
		if (suffix && out.name) out.name = out.name + suffix;
		return out;
	})
);

vi.mock('$lib/services/database', () => ({ db: dbMock }));
vi.mock('$lib/services/clipboardService', () => ({
	prepareEntityData: prepareEntityDataMock
}));

import {
	loadBrandChildren,
	loadMaterialChildren,
	loadFilamentChildren,
	pasteBrandChildren,
	pasteMaterialChildren,
	pasteFilamentChildren,
	duplicateBrandChildren,
	duplicateMaterialChildren,
	duplicateFilamentChildren
} from '../duplicateService';

beforeEach(() => {
	for (const fn of Object.values(dbMock)) fn.mockReset();
	prepareEntityDataMock.mockClear();
});

describe('loadBrandChildren', () => {
	it('returns materials and nests filaments with their variants under each material', async () => {
		dbMock.loadMaterials.mockResolvedValue([
			{ id: 'pla', material: 'PLA', materialType: 'PLA' },
			{ id: 'abs', material: 'ABS', materialType: 'ABS' }
		]);
		dbMock.loadFilaments.mockImplementation(async (_brand: string, type: string) => {
			if (type === 'PLA') return [{ id: 'basic', name: 'Basic', slug: 'basic' }];
			if (type === 'ABS') return [{ id: 'tough', name: 'Tough', slug: 'tough' }];
			return [];
		});
		dbMock.loadVariants.mockImplementation(async (_b: string, _m: string, fil: string) => {
			if (fil === 'basic') return [{ id: 'red', color_name: 'Red' }];
			if (fil === 'tough') return [{ id: 'blue', color_name: 'Blue' }];
			return [];
		});

		const result = await loadBrandChildren('acme');

		expect(result.materials).toHaveLength(2);
		expect(result.materials[0].material).toBe('PLA');
		expect(result.filaments).toHaveLength(2);
		// Filament records carry _parentMaterial and _variants metadata
		const basicFil = result.filaments.find((f: any) => f.slug === 'basic')!;
		expect(basicFil._parentMaterial).toBe('PLA');
		expect(basicFil._variants).toEqual([{ id: 'red', color_name: 'Red' }]);
	});

	it('falls back to material.toUpperCase() when materialType is missing', async () => {
		dbMock.loadMaterials.mockResolvedValue([{ id: 'pla', material: 'pla' }]);
		dbMock.loadFilaments.mockResolvedValue([]);

		await loadBrandChildren('acme');

		expect(dbMock.loadFilaments).toHaveBeenCalledWith('acme', 'PLA');
	});

	it('skips materials missing both materialType and material', async () => {
		dbMock.loadMaterials.mockResolvedValue([{ id: 'broken' }]);

		const result = await loadBrandChildren('acme');

		expect(dbMock.loadFilaments).not.toHaveBeenCalled();
		expect(result.materials).toHaveLength(1);
		expect(result.filaments).toBeUndefined();
	});

	it('uses filament.slug as the filament id when present', async () => {
		dbMock.loadMaterials.mockResolvedValue([{ id: 'pla', material: 'PLA', materialType: 'PLA' }]);
		dbMock.loadFilaments.mockResolvedValue([{ id: 'uuid-fil', slug: 'basic' }]);
		dbMock.loadVariants.mockResolvedValue([]);

		await loadBrandChildren('acme');

		expect(dbMock.loadVariants).toHaveBeenCalledWith('acme', 'PLA', 'basic');
	});
});

describe('loadMaterialChildren', () => {
	it('returns filaments with their variants nested under _variants', async () => {
		dbMock.loadFilaments.mockResolvedValue([
			{ id: 'basic', slug: 'basic', name: 'Basic' },
			{ id: 'plus', slug: 'plus', name: 'Plus' }
		]);
		dbMock.loadVariants.mockImplementation(async (_b: string, _m: string, fil: string) => {
			if (fil === 'basic') return [{ id: 'red' }];
			if (fil === 'plus') return [{ id: 'blue' }, { id: 'green' }];
			return [];
		});

		const result = await loadMaterialChildren('acme', 'PLA');

		expect(result.filaments).toHaveLength(2);
		const basic = result.filaments.find((f: any) => f.slug === 'basic');
		const plus = result.filaments.find((f: any) => f.slug === 'plus');
		expect(basic._variants).toHaveLength(1);
		expect(plus._variants).toHaveLength(2);
	});

	it('skips filaments without a matching index entry', async () => {
		dbMock.loadFilaments.mockResolvedValue([]);
		const result = await loadMaterialChildren('acme', 'PLA');
		expect(result.filaments).toHaveLength(0);
	});
});

describe('loadFilamentChildren', () => {
	it('returns variants nested under .variants', async () => {
		dbMock.loadVariants.mockResolvedValue([
			{ id: 'red', color_name: 'Red' },
			{ id: 'blue', color_name: 'Blue' }
		]);

		const result = await loadFilamentChildren('acme', 'PLA', 'basic');

		expect(result.variants).toHaveLength(2);
		expect(result.variants[0].color_name).toBe('Red');
	});

	it('returns empty variants array when none exist', async () => {
		dbMock.loadVariants.mockResolvedValue([]);
		const result = await loadFilamentChildren('acme', 'PLA', 'basic');
		expect(result.variants).toEqual([]);
	});
});

describe('pasteBrandChildren', () => {
	it('creates materials, then filaments under matching material, then variants', async () => {
		dbMock.createMaterial.mockImplementation(async (_b: string, data: any) => ({
			success: true,
			materialType: (data.material as string).toUpperCase()
		}));
		dbMock.createFilament.mockImplementation(async () => ({
			success: true,
			filamentId: 'new-fil-id'
		}));
		dbMock.createVariant.mockResolvedValue({ success: true });

		const children = {
			materials: [{ id: 'pla-src', material: 'PLA' }],
			filaments: [
				{
					id: 'basic-src',
					slug: 'basic',
					name: 'Basic',
					_parentMaterial: 'PLA',
					_variants: [{ id: 'red', color_name: 'Red' }]
				}
			]
		};

		await pasteBrandChildren('target-brand', children);

		expect(dbMock.createMaterial).toHaveBeenCalledTimes(1);
		expect(dbMock.createFilament).toHaveBeenCalledTimes(1);
		expect(dbMock.createVariant).toHaveBeenCalledTimes(1);

		// The variant should reference the newly-created filament id, not the source id
		const variantCall = dbMock.createVariant.mock.calls[0];
		expect(variantCall[3].filament_id).toBe('new-fil-id');

		// All entities should have been stripped via prepareEntityData
		expect(prepareEntityDataMock).toHaveBeenCalledWith('material', expect.any(Object));
		expect(prepareEntityDataMock).toHaveBeenCalledWith('filament', expect.any(Object));
		expect(prepareEntityDataMock).toHaveBeenCalledWith('variant', expect.any(Object));
	});

	it('only attaches filaments to their original material (by _parentMaterial)', async () => {
		dbMock.createMaterial.mockImplementation(async (_b: string, data: any) => ({
			success: true,
			materialType: (data.material as string).toUpperCase()
		}));
		dbMock.createFilament.mockResolvedValue({ success: true, filamentId: 'new-fil' });
		dbMock.createVariant.mockResolvedValue({ success: true });

		const children = {
			materials: [{ material: 'PLA' }, { material: 'ABS' }],
			filaments: [
				{ name: 'PLA-Basic', _parentMaterial: 'PLA', _variants: [] },
				{ name: 'ABS-Tough', _parentMaterial: 'ABS', _variants: [] }
			]
		};

		await pasteBrandChildren('target', children);

		const calls = dbMock.createFilament.mock.calls;
		expect(calls).toHaveLength(2);
		// First filament: under PLA
		expect(calls[0][1]).toBe('PLA');
		// Second filament: under ABS
		expect(calls[1][1]).toBe('ABS');
	});

	it('skips child creation if parent material creation fails', async () => {
		dbMock.createMaterial.mockResolvedValue({ success: false });

		const children = {
			materials: [{ material: 'PLA' }],
			filaments: [{ name: 'Basic', _parentMaterial: 'PLA', _variants: [] }]
		};

		await pasteBrandChildren('target', children);

		expect(dbMock.createFilament).not.toHaveBeenCalled();
		expect(dbMock.createVariant).not.toHaveBeenCalled();
	});

	it('handles missing children gracefully', async () => {
		dbMock.createMaterial.mockResolvedValue({ success: true, materialType: 'PLA' });

		await pasteBrandChildren('target', {});

		expect(dbMock.createMaterial).not.toHaveBeenCalled();
		expect(dbMock.createFilament).not.toHaveBeenCalled();
	});

	it('strips internal _parentMaterial and _variants fields before persisting', async () => {
		dbMock.createMaterial.mockResolvedValue({ success: true, materialType: 'PLA' });
		dbMock.createFilament.mockResolvedValue({ success: true, filamentId: 'new-fil' });

		const filamentClipboardEntry = {
			name: 'Basic',
			_parentMaterial: 'PLA',
			_variants: [],
			_internal: 'should also be stripped'
		};
		await pasteBrandChildren('target', {
			materials: [{ material: 'PLA' }],
			filaments: [filamentClipboardEntry]
		});

		const createFilamentArgs = dbMock.createFilament.mock.calls[0][2];
		expect(createFilamentArgs._parentMaterial).toBeUndefined();
		expect(createFilamentArgs._variants).toBeUndefined();
		expect(createFilamentArgs._internal).toBeUndefined();
		expect(createFilamentArgs.name).toBe('Basic');
	});
});

describe('pasteMaterialChildren', () => {
	it('creates filaments and their variants under the target material', async () => {
		dbMock.createFilament.mockResolvedValue({ success: true, filamentId: 'new-fil' });
		dbMock.createVariant.mockResolvedValue({ success: true });

		const children = {
			filaments: [
				{
					name: 'Basic',
					_variants: [{ color_name: 'Red' }, { color_name: 'Blue' }]
				}
			]
		};

		await pasteMaterialChildren('target', 'PLA', children);

		expect(dbMock.createFilament).toHaveBeenCalledTimes(1);
		expect(dbMock.createVariant).toHaveBeenCalledTimes(2);
		expect(dbMock.createVariant.mock.calls[0][3].filament_id).toBe('new-fil');
	});

	it('handles missing filaments array', async () => {
		await pasteMaterialChildren('target', 'PLA', {});
		expect(dbMock.createFilament).not.toHaveBeenCalled();
	});

	it('skips variants if filament creation fails', async () => {
		dbMock.createFilament.mockResolvedValue({ success: false });

		await pasteMaterialChildren('target', 'PLA', {
			filaments: [{ name: 'Basic', _variants: [{ color_name: 'Red' }] }]
		});

		expect(dbMock.createVariant).not.toHaveBeenCalled();
	});
});

describe('pasteFilamentChildren', () => {
	it('creates each variant under the target filament', async () => {
		dbMock.createVariant.mockResolvedValue({ success: true });

		await pasteFilamentChildren('target', 'PLA', 'fil-1', {
			variants: [{ color_name: 'Red' }, { color_name: 'Blue' }]
		});

		expect(dbMock.createVariant).toHaveBeenCalledTimes(2);
		expect(dbMock.createVariant.mock.calls[0][3].filament_id).toBe('fil-1');
	});

	it('handles missing variants array', async () => {
		await pasteFilamentChildren('target', 'PLA', 'fil-1', {});
		expect(dbMock.createVariant).not.toHaveBeenCalled();
	});
});

describe('duplicateBrandChildren', () => {
	it('duplicates all descendants recursively when includeAll is true', async () => {
		dbMock.loadMaterials.mockResolvedValue([{ id: 'pla', material: 'PLA', materialType: 'PLA' }]);
		dbMock.loadFilaments.mockResolvedValue([{ id: 'basic', slug: 'basic', name: 'Basic' }]);
		dbMock.loadVariants.mockResolvedValue([{ id: 'red', color_name: 'Red' }]);
		dbMock.createMaterial.mockResolvedValue({ success: true, materialType: 'PLA' });
		dbMock.createFilament.mockResolvedValue({ success: true, filamentId: 'new-fil' });
		dbMock.createVariant.mockResolvedValue({ success: true });

		await duplicateBrandChildren('source', 'target', true);

		expect(dbMock.createMaterial).toHaveBeenCalledTimes(1);
		expect(dbMock.createFilament).toHaveBeenCalledTimes(1);
		expect(dbMock.createVariant).toHaveBeenCalledTimes(1);
	});

	it('only duplicates the materials layer when includeAll is false', async () => {
		dbMock.loadMaterials.mockResolvedValue([{ id: 'pla', material: 'PLA', materialType: 'PLA' }]);
		dbMock.createMaterial.mockResolvedValue({ success: true, materialType: 'PLA' });

		await duplicateBrandChildren('source', 'target', false);

		expect(dbMock.createMaterial).toHaveBeenCalledTimes(1);
		expect(dbMock.loadFilaments).not.toHaveBeenCalled();
		expect(dbMock.createFilament).not.toHaveBeenCalled();
		expect(dbMock.createVariant).not.toHaveBeenCalled();
	});

	it('skips descendants if material creation fails', async () => {
		dbMock.loadMaterials.mockResolvedValue([{ id: 'pla', material: 'PLA', materialType: 'PLA' }]);
		dbMock.createMaterial.mockResolvedValue({ success: false });

		await duplicateBrandChildren('source', 'target', true);

		expect(dbMock.loadFilaments).not.toHaveBeenCalled();
	});
});

describe('duplicateMaterialChildren', () => {
	it('duplicates filaments and variants recursively', async () => {
		dbMock.loadFilaments.mockResolvedValue([{ id: 'basic', slug: 'basic', name: 'Basic' }]);
		dbMock.loadVariants.mockResolvedValue([{ id: 'red' }]);
		dbMock.createFilament.mockResolvedValue({ success: true, filamentId: 'new-fil' });
		dbMock.createVariant.mockResolvedValue({ success: true });

		await duplicateMaterialChildren('src', 'PLA', 'tgt', 'PLA', true);

		expect(dbMock.createFilament).toHaveBeenCalledTimes(1);
		expect(dbMock.createVariant).toHaveBeenCalledTimes(1);
	});

	it('does not recurse when includeAll is false', async () => {
		dbMock.loadFilaments.mockResolvedValue([{ id: 'basic', slug: 'basic', name: 'Basic' }]);
		dbMock.createFilament.mockResolvedValue({ success: true, filamentId: 'new-fil' });

		await duplicateMaterialChildren('src', 'PLA', 'tgt', 'PLA', false);

		expect(dbMock.loadVariants).not.toHaveBeenCalled();
		expect(dbMock.createVariant).not.toHaveBeenCalled();
	});
});

describe('duplicateFilamentChildren', () => {
	it('duplicates each variant under the target filament', async () => {
		dbMock.loadVariants.mockResolvedValue([{ id: 'red' }, { id: 'blue' }]);
		dbMock.createVariant.mockResolvedValue({ success: true });

		await duplicateFilamentChildren('src', 'PLA', 'src-fil', 'tgt', 'PLA', 'tgt-fil');

		expect(dbMock.createVariant).toHaveBeenCalledTimes(2);
		expect(dbMock.createVariant.mock.calls[0][3].filament_id).toBe('tgt-fil');
	});
});
