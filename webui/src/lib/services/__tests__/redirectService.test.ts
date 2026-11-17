/**
 * Tests for the redirect-first delete service.
 *
 * `absorbMovedFrom` is the TS half of a rule CI also enforces in Python
 * (`_absorb_moved_from` in ofd/uuids.py). The cases below mirror
 * tests/test_uuids_resolve.py so the two implementations stay provably aligned —
 * a divergence writes redirects the build can't resolve.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	getFilament: vi.fn(),
	saveFilament: vi.fn(),
	loadVariants: vi.fn(),
	getMaterial: vi.fn(),
	saveMaterial: vi.fn(),
	deleteEntity: vi.fn()
}));

vi.mock('$lib/services/database', () => ({
	db: {
		getFilament: mocks.getFilament,
		saveFilament: mocks.saveFilament,
		loadVariants: mocks.loadVariants,
		// Unused by these tests, but the registry references them at module load.
		getStore: vi.fn(),
		saveStore: vi.fn(),
		getBrand: vi.fn(),
		saveBrand: vi.fn(),
		getMaterial: mocks.getMaterial,
		saveMaterial: mocks.saveMaterial,
		getVariant: vi.fn(),
		saveVariant: vi.fn()
	}
}));

vi.mock('$lib/services/entityService', () => ({
	deleteEntity: mocks.deleteEntity
}));

import { absorbMovedFrom, redirectAndDelete, loadVariantTargets } from '../redirectService';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

const SOURCE = {
	type: 'filament' as const,
	path: 'brands/acme/materials/PLA/filaments/gone',
	label: 'Filament',
	name: 'Gone',
	uuid: U1,
	deleteFn: vi.fn(async () => true)
};

const TARGET = {
	path: 'brands/acme/materials/PLA/filaments/keep',
	name: 'Keep',
	href: '/brands/acme/PLA/keep'
};

describe('absorbMovedFrom', () => {
	it('records the source uuid on a target that has none', () => {
		const { movedFrom, added } = absorbMovedFrom({ uuid: U2 }, { uuid: U1 });
		expect(added).toEqual([U1]);
		expect(movedFrom).toEqual([U1]);
	});

	it('flattens chains — the source’s own moved_from comes along', () => {
		const { movedFrom, added } = absorbMovedFrom({ uuid: U3 }, { uuid: U2, moved_from: [U1] });
		expect(new Set(added)).toEqual(new Set([U1, U2]));
		expect(movedFrom).toEqual([U2, U1]);
	});

	it('never records the target’s own uuid (no self-redirect)', () => {
		const { movedFrom, added } = absorbMovedFrom({ uuid: U1 }, { uuid: U1 });
		expect(added).toEqual([]);
		expect(movedFrom).toEqual([]);
	});

	it('dedupes case-insensitively and keeps existing entries as-is', () => {
		const existing = U1.toUpperCase();
		const { movedFrom, added } = absorbMovedFrom(
			{ uuid: U2, moved_from: [existing] },
			{ uuid: U1 }
		);
		expect(added).toEqual([]);
		expect(movedFrom).toEqual([existing]);
	});

	it('normalizes candidates and drops junk', () => {
		const { movedFrom, added } = absorbMovedFrom(
			{ uuid: U3 },
			{ uuid: `  ${U1.toUpperCase()} `, moved_from: ['', '   ', null as any, U2] }
		);
		expect(added).toEqual([U1, U2]);
		expect(movedFrom).toEqual([U1, U2]);
	});

	it('is a no-op when the source has no identity to hand over', () => {
		const { movedFrom, added } = absorbMovedFrom(
			{ uuid: U2, moved_from: [U3] },
			{ uuid: undefined }
		);
		expect(added).toEqual([]);
		expect(movedFrom).toEqual([U3]);
	});
});

describe('redirectAndDelete', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.deleteEntity.mockResolvedValue({
			success: true,
			message: 'Filament marked for deletion'
		});
	});

	it('deletes without touching any target when none is given', async () => {
		const result = await redirectAndDelete(SOURCE, null);

		expect(mocks.getFilament).not.toHaveBeenCalled();
		expect(mocks.saveFilament).not.toHaveBeenCalled();
		expect(mocks.deleteEntity).toHaveBeenCalledWith(SOURCE.path, 'Filament', SOURCE.deleteFn);
		expect(result.success).toBe(true);
	});

	it('records the redirect on the target before staging the delete', async () => {
		const order: string[] = [];
		mocks.getFilament.mockResolvedValue({ id: 'keep', uuid: U2, name: 'Keep' });
		mocks.saveFilament.mockImplementation(async () => {
			order.push('save');
			return true;
		});
		mocks.deleteEntity.mockImplementation(async () => {
			order.push('delete');
			return { success: true, message: 'Filament marked for deletion' };
		});

		const result = await redirectAndDelete(SOURCE, TARGET);

		expect(order).toEqual(['save', 'delete']);
		expect(mocks.saveFilament).toHaveBeenCalledWith(
			'acme',
			'PLA',
			'keep',
			expect.objectContaining({ moved_from: [U1] }),
			expect.objectContaining({ uuid: U2 })
		);
		expect(result.recorded).toEqual([U1]);
		expect(result.targetHref).toBe(TARGET.href);
	});

	// Cloud payloads put a UUID in `id` and the repo folder name in `slug`; saving
	// that straight back fails the schema's slug pattern and the folder-name check.
	it('writes repo-form identity, not the cloud UUID', async () => {
		mocks.getFilament.mockResolvedValue({
			id: 'f7f083ca-2320-54a6-afc4-8149e9103b30',
			slug: 'keep',
			uuid: U2,
			name: 'Keep'
		});
		mocks.saveFilament.mockResolvedValue(true);

		await redirectAndDelete(SOURCE, TARGET);

		const [, , , next, prev] = mocks.saveFilament.mock.calls[0];
		expect(next).toMatchObject({ id: 'keep', slug: 'keep', moved_from: [U1] });
		// The original is normalized too, so the staged change is only the redirect.
		expect(prev).toMatchObject({ id: 'keep', slug: 'keep' });
		expect(prev.moved_from).toBeUndefined();
	});

	it('falls back to the path segment when the entity has no slug', async () => {
		mocks.getFilament.mockResolvedValue({ id: 'some-uuid', uuid: U2, name: 'Keep' });
		mocks.saveFilament.mockResolvedValue(true);

		await redirectAndDelete(SOURCE, TARGET);

		expect(mocks.saveFilament.mock.calls[0][3]).toMatchObject({ id: 'keep', slug: 'keep' });
	});

	it('keys a material by its type rather than a slug', async () => {
		mocks.getMaterial.mockResolvedValue({ id: 'd25f2df6-cloud-uuid', slug: 'PLA', uuid: U2 });
		mocks.saveMaterial.mockResolvedValue(true);

		const result = await redirectAndDelete(
			{ ...SOURCE, type: 'material', path: 'brands/acme/materials/PETG', label: 'Material' },
			{ path: 'brands/acme/materials/PLA', name: 'PLA', href: '/brands/acme/PLA' }
		);

		expect(mocks.saveMaterial).toHaveBeenCalledWith(
			'acme',
			'PLA',
			expect.objectContaining({ id: 'PLA', materialType: 'PLA', moved_from: [U1] }),
			expect.objectContaining({ id: 'PLA', materialType: 'PLA' })
		);
		expect(result.success).toBe(true);
	});

	it('skips the save when the redirect adds nothing, but still deletes', async () => {
		mocks.getFilament.mockResolvedValue({ id: 'keep', uuid: U2, moved_from: [U1] });

		const result = await redirectAndDelete(SOURCE, TARGET);

		expect(mocks.saveFilament).not.toHaveBeenCalled();
		expect(mocks.deleteEntity).toHaveBeenCalled();
		expect(result.recorded).toEqual([]);
	});

	it('does not delete when recording the redirect fails', async () => {
		mocks.getFilament.mockResolvedValue({ id: 'keep', uuid: U2 });
		mocks.saveFilament.mockResolvedValue(false);

		const result = await redirectAndDelete(SOURCE, TARGET);

		expect(result.success).toBe(false);
		expect(mocks.deleteEntity).not.toHaveBeenCalled();
	});

	it('does not delete when the replacement no longer resolves', async () => {
		mocks.getFilament.mockResolvedValue(null);

		const result = await redirectAndDelete(SOURCE, TARGET);

		expect(result.success).toBe(false);
		expect(result.message).toMatch(/not found/i);
		expect(mocks.deleteEntity).not.toHaveBeenCalled();
	});

	it('rejects a cross-type target', async () => {
		const result = await redirectAndDelete(SOURCE, {
			path: 'brands/acme',
			name: 'Acme',
			href: '/brands/acme'
		});

		expect(result.success).toBe(false);
		expect(mocks.deleteEntity).not.toHaveBeenCalled();
	});

	it('rejects redirecting an entity to itself, whatever the casing', async () => {
		const result = await redirectAndDelete(SOURCE, {
			path: SOURCE.path.toUpperCase(),
			name: 'Gone',
			href: '/brands/acme/PLA/gone'
		});

		expect(result.success).toBe(false);
		expect(mocks.deleteEntity).not.toHaveBeenCalled();
	});
});

describe('loadVariantTargets', () => {
	beforeEach(() => vi.clearAllMocks());

	it('lists a filament’s variants as targets', async () => {
		mocks.loadVariants.mockResolvedValue([
			{ id: 'red', slug: 'red', name: 'Red' },
			{ id: 'blue', name: 'Blue' }
		]);

		const targets = await loadVariantTargets('brands/acme/materials/PLA/filaments/keep');

		expect(mocks.loadVariants).toHaveBeenCalledWith('acme', 'PLA', 'keep');
		expect(targets).toEqual([
			{
				path: 'brands/acme/materials/PLA/filaments/keep/variants/red',
				name: 'Red',
				href: '/brands/acme/PLA/keep/red'
			},
			{
				path: 'brands/acme/materials/PLA/filaments/keep/variants/blue',
				name: 'Blue',
				href: '/brands/acme/PLA/keep/blue'
			}
		]);
	});

	it('returns nothing for a path that is not a filament', async () => {
		expect(await loadVariantTargets('brands/acme')).toEqual([]);
		expect(mocks.loadVariants).not.toHaveBeenCalled();
	});
});
