/**
 * Regression test for SUPPLEMENTARY_KEYS in changes.ts.
 *
 * Fields that aren't in an entity's JSON schema but are still tracked in the
 * change tree (e.g. `sizes` on variants, `materialType` on materials) must
 * survive filterToSchema(). If someone removes an entry from SUPPLEMENTARY_KEYS
 * in changes.ts, this test will catch the regression.
 *
 * CLAUDE.md explicitly flags this as a silent-strip risk worth guarding.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));

// Mock change-tracking flag to be on
const mocks = vi.hoisted(() => {
	let value = true;
	const subs = new Set<(v: boolean) => void>();
	return {
		mockUseChangeTracking: {
			subscribe(fn: (v: boolean) => void) {
				fn(value);
				subs.add(fn);
				return () => subs.delete(fn);
			},
			set(v: boolean) {
				value = v;
				for (const fn of subs) fn(v);
			}
		}
	};
});

vi.mock('$lib/stores/environment', () => ({
	useChangeTracking: mocks.mockUseChangeTracking
}));

// Mock fetchEntitySchema to return minimal schemas (without supplementary keys).
// IMPORTANT: schemas must be inlined into the factory — `vi.mock` is hoisted
// above top-level `const` declarations, so external variables would be TDZ.
vi.mock('$lib/services/schemaService', () => {
	const schemas: Record<string, any> = {
		brand: { type: 'object', properties: { id: {}, name: {}, website: {}, logo: {} } },
		// material: deliberately omits `materialType` and `id` (SUPPLEMENTARY_KEYS adds them)
		material: { type: 'object', properties: { material: {}, density: {} } },
		// variant: deliberately omits `sizes` (SUPPLEMENTARY_KEYS adds it)
		variant: { type: 'object', properties: { id: {}, color_name: {}, color_hex: {} } },
		filament: { type: 'object', properties: { id: {}, name: {}, diameter: {} } },
		store: { type: 'object', properties: { id: {}, name: {}, storefront_url: {} } }
	};
	return {
		fetchEntitySchema: async (entityType: string) => schemas[entityType] ?? null,
		SCHEMA_NAMES: {
			brand: 'brand_schema.json',
			material: 'material_schema.json',
			filament: 'filament_schema.json',
			variant: 'variant_schema.json',
			store: 'store_schema.json',
			materialTypes: 'material_types_schema.json'
		}
	};
});

// IndexedDB image stub
vi.mock('$lib/services/imageDb', () => ({
	setImage: vi.fn(async () => {}),
	getImage: vi.fn(async () => null),
	removeImage: vi.fn(async () => {}),
	removeImages: vi.fn(async () => {}),
	clearAll: vi.fn(async () => {}),
	getAllKeys: vi.fn(async () => [])
}));

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] ?? null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
		clear: vi.fn(() => {
			store = {};
		})
	};
})();
Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	writable: true
});

import { changeStore } from '../changes';

/** Helper: read the change for a given path from the tree-based store */
function getChangeAt(path: string) {
	const state: any = get(changeStore);
	return state._index.get(path)?.change;
}

/** Wait for the async warmSchemaCache() call to settle */
async function flushAsync() {
	// A couple of microtask flushes is enough for the mocked Promise.all
	for (let i = 0; i < 5; i++) {
		await Promise.resolve();
	}
}

describe('SUPPLEMENTARY_KEYS regression', () => {
	beforeEach(async () => {
		localStorageMock.clear();
		mocks.mockUseChangeTracking.set(true);
		changeStore.clear();
		// Ensure the schema cache is primed before tests run filterToSchema
		await flushAsync();
	});

	describe('variant.sizes', () => {
		it('preserves the `sizes` array when tracking a variant create', () => {
			const entity = {
				type: 'variant' as const,
				id: 'red',
				path: 'brands/acme/materials/pla/filaments/basic/variants/red'
			};
			const data = {
				id: 'red',
				color_name: 'Red',
				color_hex: 'FF0000',
				sizes: [
					{ diameter: 1.75, weight: 1000, empty_spool_weight: 250 }
				]
			};

			changeStore.trackCreate(entity, data);

			const change = getChangeAt(entity.path);
			expect(change).toBeDefined();
			expect(change!.data.sizes).toBeDefined();
			expect(change!.data.sizes).toHaveLength(1);
			expect(change!.data.sizes[0].diameter).toBe(1.75);
		});

		it('preserves the `sizes` array when tracking a variant update', () => {
			const entity = {
				type: 'variant' as const,
				id: 'red',
				path: 'brands/acme/materials/pla/filaments/basic/variants/red'
			};
			const oldData = {
				id: 'red',
				color_name: 'Red',
				color_hex: 'FF0000',
				sizes: [{ diameter: 1.75, weight: 500 }]
			};
			const newData = {
				id: 'red',
				color_name: 'Crimson',
				color_hex: 'DC143C',
				sizes: [
					{ diameter: 1.75, weight: 1000 },
					{ diameter: 2.85, weight: 1000 }
				]
			};

			changeStore.trackUpdate(entity, oldData, newData);

			const change = getChangeAt(entity.path);
			expect(change).toBeDefined();
			expect(change!.data.sizes).toHaveLength(2);
			expect(change!.data.sizes[1].diameter).toBe(2.85);
		});

		it('still strips fields that are NOT in either schema or SUPPLEMENTARY_KEYS', () => {
			const entity = {
				type: 'variant' as const,
				id: 'red',
				path: 'brands/acme/materials/pla/filaments/basic/variants/red'
			};
			const data = {
				id: 'red',
				color_name: 'Red',
				color_hex: 'FF0000',
				sizes: [{ diameter: 1.75 }],
				bogusField: 'this should be stripped'
			};

			changeStore.trackCreate(entity, data);

			const change = getChangeAt(entity.path);
			expect(change!.data.bogusField).toBeUndefined();
			expect(change!.data.sizes).toBeDefined();
		});
	});

	describe('material.materialType and material.id', () => {
		it('preserves `materialType` when tracking a material create', () => {
			const entity = {
				type: 'material' as const,
				id: 'pla',
				path: 'brands/acme/materials/pla'
			};
			const data = {
				id: 'pla',
				material: 'PLA',
				materialType: 'PLA',
				density: 1.24
			};

			changeStore.trackCreate(entity, data);

			const change = getChangeAt(entity.path);
			expect(change).toBeDefined();
			expect(change!.data.materialType).toBe('PLA');
			expect(change!.data.id).toBe('pla');
		});

		it('preserves `materialType` when tracking a material update', () => {
			const entity = {
				type: 'material' as const,
				id: 'pla',
				path: 'brands/acme/materials/pla'
			};
			const oldData = { id: 'pla', material: 'PLA', materialType: 'PLA', density: 1.24 };
			const newData = { id: 'pla', material: 'PLA Plus', materialType: 'PLA', density: 1.25 };

			changeStore.trackUpdate(entity, oldData, newData);

			const change = getChangeAt(entity.path);
			expect(change).toBeDefined();
			expect(change!.data.materialType).toBe('PLA');
		});

		it('strips fields that are neither in the material schema nor supplementary', () => {
			const entity = {
				type: 'material' as const,
				id: 'pla',
				path: 'brands/acme/materials/pla'
			};
			const data = {
				id: 'pla',
				material: 'PLA',
				materialType: 'PLA',
				bogus: 'strip me'
			};

			changeStore.trackCreate(entity, data);

			const change = getChangeAt(entity.path);
			expect(change!.data.bogus).toBeUndefined();
			expect(change!.data.materialType).toBe('PLA');
		});
	});

	describe('schema-only entity types', () => {
		it('brand: strips fields outside the schema', () => {
			const entity = {
				type: 'brand' as const,
				id: 'acme',
				path: 'brands/acme'
			};
			const data = {
				id: 'acme',
				name: 'Acme',
				website: 'acme.com',
				logo: 'logo.png',
				bogus: 'gone'
			};

			changeStore.trackCreate(entity, data);

			const change = getChangeAt('brands/acme');
			expect(change!.data.name).toBe('Acme');
			expect(change!.data.bogus).toBeUndefined();
		});

		it('store: strips fields outside the schema', () => {
			const entity = {
				type: 'store' as const,
				id: 'shop',
				path: 'stores/shop'
			};
			const data = {
				id: 'shop',
				name: 'Shop',
				storefront_url: 'https://shop.example',
				bogus: 'gone'
			};

			changeStore.trackCreate(entity, data);

			const change = getChangeAt('stores/shop');
			expect(change!.data.name).toBe('Shop');
			expect(change!.data.bogus).toBeUndefined();
		});

		it('filament: strips fields outside the schema', () => {
			const entity = {
				type: 'filament' as const,
				id: 'basic',
				path: 'brands/acme/materials/pla/filaments/basic'
			};
			const data = {
				id: 'basic',
				name: 'Basic PLA',
				diameter: 1.75,
				bogus: 'gone'
			};

			changeStore.trackCreate(entity, data);

			const change = getChangeAt(entity.path);
			expect(change!.data.name).toBe('Basic PLA');
			expect(change!.data.bogus).toBeUndefined();
		});
	});

	// Cloud-loaded stores/brands carry repo-format identifiers in non-schema
	// fields (`slug`, `logo_name`, `logo_slug`). cleanEntityData() needs them to
	// rebuild the on-disk `id`/`logo` before validation and PR export. If
	// filterToSchema strips them, the cloud UUID `id` and CDN `logo_slug` leak
	// into the saved change and fail schema validation.
	describe('store/brand cloud-origin identifier fields', () => {
		it('store: preserves slug, logo_name, logo_slug but still strips unknown fields', () => {
			const entity = {
				type: 'store' as const,
				id: 'f78b7ee7-b60e-573d-a98e-f1531ca751b2',
				path: 'stores/3d_eksperten'
			};
			const data = {
				id: 'f78b7ee7-b60e-573d-a98e-f1531ca751b2', // cloud UUID
				slug: '3d_eksperten',
				name: '3D Eksperten',
				storefront_url: 'https://3deksperten.dk/',
				logo: 'a1b2c3.jpg', // cloud CDN alias (logo_slug)
				logo_name: 'logo.jpg', // repo-format filename
				logo_slug: 'a1b2c3',
				bogus: 'gone'
			};

			changeStore.trackCreate(entity, data);

			const change = getChangeAt(entity.path);
			expect(change).toBeDefined();
			expect(change!.data.slug).toBe('3d_eksperten');
			expect(change!.data.logo_name).toBe('logo.jpg');
			expect(change!.data.logo_slug).toBe('a1b2c3');
			expect(change!.data.bogus).toBeUndefined();
		});

		it('brand: preserves slug, logo_name, logo_slug', () => {
			const entity = {
				type: 'brand' as const,
				id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
				path: 'brands/acme'
			};
			const data = {
				id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
				slug: 'acme',
				name: 'Acme',
				logo: 'deadbeef.png',
				logo_name: 'logo.png',
				logo_slug: 'deadbeef'
			};

			changeStore.trackCreate(entity, data);

			const change = getChangeAt('brands/acme');
			expect(change).toBeDefined();
			expect(change!.data.slug).toBe('acme');
			expect(change!.data.logo_name).toBe('logo.png');
			expect(change!.data.logo_slug).toBe('deadbeef');
		});
	});
});
