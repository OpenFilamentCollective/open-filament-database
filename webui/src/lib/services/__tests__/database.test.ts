import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writable, get } from 'svelte/store';

// Mock stores
const mockIsCloudMode = writable(false);
const mockChangeStore = writable({
	changes: {} as Record<string, { operation: string; data?: any; originalData?: any }>,
	images: {},
	lastModified: Date.now()
});

vi.mock('$lib/stores/environment', () => ({
	isCloudMode: mockIsCloudMode
}));

vi.mock('$lib/stores/changes', () => ({
	changeStore: {
		subscribe: (fn: (value: any) => void) => mockChangeStore.subscribe(fn),
		trackCreate: vi.fn(),
		trackUpdate: vi.fn(),
		trackDelete: vi.fn()
	}
}));

// Mock apiFetch
const mockApiFetch = vi.fn();
vi.mock('$lib/utils/api', () => ({
	apiFetch: (...args: any[]) => mockApiFetch(...args)
}));

// Import after mocks
import { DatabaseService } from '../database';
import { changeStore } from '$lib/stores/changes';

describe('DatabaseService', () => {
	let db: DatabaseService;

	beforeEach(() => {
		// Reset singleton by accessing private property
		(DatabaseService as any).instance = undefined;
		db = DatabaseService.getInstance();

		mockIsCloudMode.set(false);
		mockChangeStore.set({
			changes: {},
			images: {},
			lastModified: Date.now()
		});
		mockApiFetch.mockReset();
		vi.mocked(changeStore.trackCreate).mockClear();
		vi.mocked(changeStore.trackUpdate).mockClear();
		vi.mocked(changeStore.trackDelete).mockClear();
	});

	describe('getInstance', () => {
		it('should return singleton instance', () => {
			const instance1 = DatabaseService.getInstance();
			const instance2 = DatabaseService.getInstance();

			expect(instance1).toBe(instance2);
		});

		it('should return same instance on multiple calls', () => {
			const instances = [];
			for (let i = 0; i < 5; i++) {
				instances.push(DatabaseService.getInstance());
			}

			expect(new Set(instances).size).toBe(1);
		});
	});

	describe('loadStores', () => {
		it('should fetch stores from API', async () => {
			const stores = [{ id: 'store1', name: 'Store 1' }];
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => stores
			});

			const result = await db.loadStores();

			expect(mockApiFetch).toHaveBeenCalledWith('/api/stores');
			expect(result).toEqual(stores);
		});

		it('should layer cloud mode changes', async () => {
			mockIsCloudMode.set(true);
			const baseStores = [{ id: 'store1', name: 'Store 1' }];
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseStores
			});

			// Add a create change
			mockChangeStore.set({
				changes: {
					'stores/store2': {
						operation: 'create',
						data: { id: 'store2', name: 'Store 2' }
					}
				},
				images: {},
				lastModified: Date.now()
			});

			const result = await db.loadStores();

			expect(result).toHaveLength(2);
			expect(result.find((s) => s.id === 'store2')).toBeDefined();
		});

		it('should return empty array on error', async () => {
			mockApiFetch.mockRejectedValue(new Error('Network error'));

			const result = await db.loadStores();

			expect(result).toEqual([]);
		});
	});

	describe('loadBrands', () => {
		it('should fetch brands from API', async () => {
			const brands = [{ id: 'brand1', name: 'Brand 1' }];
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => brands
			});

			const result = await db.loadBrands();

			expect(mockApiFetch).toHaveBeenCalledWith('/api/brands');
			expect(result).toEqual(brands);
		});

		it('should layer cloud mode changes', async () => {
			mockIsCloudMode.set(true);
			const baseBrands = [{ id: 'brand1', name: 'Brand 1' }];
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseBrands
			});

			mockChangeStore.set({
				changes: {
					'brands/brand1': {
						operation: 'update',
						data: { id: 'brand1', name: 'Updated Brand 1' },
						originalData: { id: 'brand1', name: 'Brand 1' }
					}
				},
				images: {},
				lastModified: Date.now()
			});

			const result = await db.loadBrands();

			expect(result[0].name).toBe('Updated Brand 1');
		});
	});

	describe('getStore', () => {
		it('should return store by ID', async () => {
			const store = { id: 'store1', name: 'Test Store' };
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => store
			});

			const result = await db.getStore('store1');

			expect(result).toEqual(store);
		});

		it('should return locally created store in cloud mode', async () => {
			mockIsCloudMode.set(true);
			mockChangeStore.set({
				changes: {
					'stores/new-store': {
						operation: 'create',
						data: { id: 'new-store', name: 'New Store' }
					}
				},
				images: {},
				lastModified: Date.now()
			});

			const result = await db.getStore('new-store');

			expect(result?.name).toBe('New Store');
			// Should not call API for locally created entity
			expect(mockApiFetch).not.toHaveBeenCalled();
		});

		it('should apply changes to fetched store', async () => {
			mockIsCloudMode.set(true);
			const baseStore = { id: 'store1', name: 'Original Name' };
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseStore
			});

			mockChangeStore.set({
				changes: {
					'stores/store1': {
						operation: 'update',
						data: { id: 'store1', name: 'Updated Name' }
					}
				},
				images: {},
				lastModified: Date.now()
			});

			const result = await db.getStore('store1');

			expect(result?.name).toBe('Updated Name');
		});

		it('should return null for non-existent store', async () => {
			mockApiFetch.mockResolvedValue({
				ok: false,
				statusText: 'Not Found'
			});

			const result = await db.getStore('non-existent');

			expect(result).toBeNull();
		});
	});

	describe('getBrand', () => {
		it('should return brand by ID', async () => {
			const brand = { id: 'brand1', name: 'Test Brand' };
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => brand
			});

			const result = await db.getBrand('brand1');

			expect(result).toEqual(brand);
		});

		it('should return locally created brand in cloud mode', async () => {
			mockIsCloudMode.set(true);
			mockChangeStore.set({
				changes: {
					'brands/new-brand': {
						operation: 'create',
						data: { id: 'new-brand', name: 'New Brand' }
					}
				},
				images: {},
				lastModified: Date.now()
			});

			const result = await db.getBrand('new-brand');

			expect(result?.name).toBe('New Brand');
			expect(mockApiFetch).not.toHaveBeenCalled();
		});

		it('should return null for deleted brand in cloud mode', async () => {
			mockIsCloudMode.set(true);
			const baseBrand = { id: 'brand1', name: 'Test Brand' };
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseBrand
			});

			mockChangeStore.set({
				changes: {
					'brands/brand1': {
						operation: 'delete'
					}
				},
				images: {},
				lastModified: Date.now()
			});

			const result = await db.getBrand('brand1');

			expect(result).toBeNull();
		});
	});

	describe('saveStore', () => {
		const store = { id: 'store1', name: 'Test Store' } as any;

		it('should track create in cloud mode for new store', async () => {
			mockIsCloudMode.set(true);

			const result = await db.saveStore(store);

			expect(result).toBe(true);
			expect(changeStore.trackCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'store',
					path: 'stores/store1',
					id: 'store1'
				}),
				store
			);
		});

		it('should track update in cloud mode for existing store', async () => {
			mockIsCloudMode.set(true);
			const oldStore = { id: 'store1', name: 'Old Name' } as any;
			const newStore = { id: 'store1', name: 'New Name' } as any;

			await db.saveStore(newStore, oldStore);

			expect(changeStore.trackUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ path: 'stores/store1' }),
				oldStore,
				newStore
			);
		});

		it('should call API in local mode', async () => {
			mockIsCloudMode.set(false);
			mockApiFetch.mockResolvedValue({ ok: true });

			const result = await db.saveStore(store);

			expect(result).toBe(true);
			expect(mockApiFetch).toHaveBeenCalledWith(
				'/api/stores/store1',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify(store)
				})
			);
		});
	});

	describe('saveBrand', () => {
		const brand = { id: 'brand1', name: 'Test Brand' } as any;

		it('should track create in cloud mode for new brand', async () => {
			mockIsCloudMode.set(true);

			const result = await db.saveBrand(brand);

			expect(result).toBe(true);
			expect(changeStore.trackCreate).toHaveBeenCalled();
		});

		it('should track update in cloud mode for existing brand', async () => {
			mockIsCloudMode.set(true);
			const oldBrand = { id: 'brand1', name: 'Old' } as any;

			await db.saveBrand(brand, oldBrand);

			expect(changeStore.trackUpdate).toHaveBeenCalled();
		});

		it('should call API in local mode', async () => {
			mockIsCloudMode.set(false);
			mockApiFetch.mockResolvedValue({ ok: true });

			await db.saveBrand(brand);

			expect(mockApiFetch).toHaveBeenCalledWith(
				'/api/brands/brand1',
				expect.objectContaining({ method: 'PUT' })
			);
		});
	});

	describe('deleteStore', () => {
		it('should track delete in cloud mode', async () => {
			mockIsCloudMode.set(true);
			const store = { id: 'store1', name: 'Test' } as any;

			const result = await db.deleteStore('store1', store);

			expect(result).toBe(true);
			expect(changeStore.trackDelete).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'store',
					path: 'stores/store1',
					id: 'store1'
				}),
				store
			);
		});

		it('should call DELETE API in local mode', async () => {
			mockIsCloudMode.set(false);
			mockApiFetch.mockResolvedValue({ ok: true });

			const result = await db.deleteStore('store1');

			expect(result).toBe(true);
			expect(mockApiFetch).toHaveBeenCalledWith('/api/stores/store1', { method: 'DELETE' });
		});
	});

	describe('deleteBrand', () => {
		it('should track delete in cloud mode', async () => {
			mockIsCloudMode.set(true);
			const brand = { id: 'brand1', name: 'Test' } as any;

			const result = await db.deleteBrand('brand1', brand);

			expect(result).toBe(true);
			expect(changeStore.trackDelete).toHaveBeenCalled();
		});

		it('should call DELETE API in local mode', async () => {
			mockIsCloudMode.set(false);
			mockApiFetch.mockResolvedValue({ ok: true });

			await db.deleteBrand('brand1');

			expect(mockApiFetch).toHaveBeenCalledWith('/api/brands/brand1', { method: 'DELETE' });
		});
	});

	describe('loadMaterials', () => {
		it('should load materials for brand', async () => {
			const materials = [{ id: 'PLA', material: 'PLA' }];
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => materials
			});

			const result = await db.loadMaterials('test-brand');

			expect(mockApiFetch).toHaveBeenCalledWith('/api/brands/test-brand/materials');
			expect(result).toEqual(materials);
		});

		it('should show locally created materials even when API fails', async () => {
			mockIsCloudMode.set(true);
			mockApiFetch.mockResolvedValue({
				ok: false,
				statusText: 'Not Found'
			});

			mockChangeStore.set({
				changes: {
					'brands/new-brand': {
						operation: 'create',
						data: { id: 'new-brand', name: 'New Brand' }
					},
					'brands/new-brand/materials/PLA': {
						operation: 'create',
						data: { id: 'PLA', material: 'PLA', materialType: 'PLA' }
					}
				},
				images: {},
				lastModified: Date.now()
			});

			const result = await db.loadMaterials('new-brand');

			expect(result).toHaveLength(1);
			expect(result[0].material).toBe('PLA');
		});
	});

	describe('layerChanges (via load methods)', () => {
		beforeEach(() => {
			mockIsCloudMode.set(true);
		});

		describe('create operations', () => {
			it('should add new entity from changes', async () => {
				mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'existing', name: 'Existing' }]
				});

				mockChangeStore.set({
					changes: {
						'brands/new': {
							operation: 'create',
							data: { id: 'new', name: 'New Brand' }
						}
					},
					images: {},
					lastModified: Date.now()
				});

				const result = await db.loadBrands();

				expect(result).toHaveLength(2);
				expect(result.find((b) => b.id === 'new')).toBeDefined();
			});

			it('should not duplicate if entity already exists', async () => {
				mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'test', name: 'Original' }]
				});

				mockChangeStore.set({
					changes: {
						'brands/test': {
							operation: 'create',
							data: { id: 'test', name: 'Created' }
						}
					},
					images: {},
					lastModified: Date.now()
				});

				const result = await db.loadBrands();

				// Should have the created version
				expect(result).toHaveLength(1);
				expect(result[0].name).toBe('Created');
			});
		});

		describe('update operations', () => {
			it('should replace existing entity with changed data', async () => {
				mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'test', name: 'Original' }]
				});

				mockChangeStore.set({
					changes: {
						'brands/test': {
							operation: 'update',
							data: { id: 'test', name: 'Updated' }
						}
					},
					images: {},
					lastModified: Date.now()
				});

				const result = await db.loadBrands();

				expect(result[0].name).toBe('Updated');
			});

			it('should handle entity ID change', async () => {
				mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'old-id', name: 'Test' }]
				});

				mockChangeStore.set({
					changes: {
						'brands/old-id': {
							operation: 'update',
							data: { id: 'new-id', name: 'Renamed' }
						}
					},
					images: {},
					lastModified: Date.now()
				});

				const result = await db.loadBrands();

				expect(result).toHaveLength(1);
				expect(result[0].id).toBe('new-id');
			});
		});

		describe('delete operations', () => {
			it('should remove entity from result', async () => {
				mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [
						{ id: 'keep', name: 'Keep' },
						{ id: 'delete', name: 'Delete' }
					]
				});

				mockChangeStore.set({
					changes: {
						'brands/delete': {
							operation: 'delete'
						}
					},
					images: {},
					lastModified: Date.now()
				});

				const result = await db.loadBrands();

				expect(result).toHaveLength(1);
				expect(result[0].id).toBe('keep');
			});

			it('should use case-insensitive matching for deletion', async () => {
				mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'TestBrand', name: 'Test' }]
				});

				mockChangeStore.set({
					changes: {
						'brands/testbrand': {
							operation: 'delete'
						}
					},
					images: {},
					lastModified: Date.now()
				});

				const result = await db.loadBrands();

				expect(result).toHaveLength(0);
			});
		});

		it('should return base data unmodified in local mode', async () => {
			mockIsCloudMode.set(false);
			const baseBrands = [{ id: 'test', name: 'Original' }];
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseBrands
			});

			mockChangeStore.set({
				changes: {
					'brands/test': {
						operation: 'update',
						data: { id: 'test', name: 'Updated' }
					}
				},
				images: {},
				lastModified: Date.now()
			});

			const result = await db.loadBrands();

			// In local mode, changes are not layered
			expect(result[0].name).toBe('Original');
		});

		it('should only apply direct child changes (not nested)', async () => {
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => [{ id: 'brand1', name: 'Brand 1' }]
			});

			mockChangeStore.set({
				changes: {
					// Direct child - should be applied
					'brands/new-brand': {
						operation: 'create',
						data: { id: 'new-brand', name: 'New Brand' }
					},
					// Nested change - should NOT be applied to brands list
					'brands/brand1/materials/PLA': {
						operation: 'create',
						data: { id: 'PLA', material: 'PLA' }
					}
				},
				images: {},
				lastModified: Date.now()
			});

			const result = await db.loadBrands();

			expect(result).toHaveLength(2);
			// The nested material change should not create a new brand entry
			expect(result.find((b) => b.id === 'PLA')).toBeUndefined();
		});
	});

	describe('loadIndex', () => {
		it('should load stores and brands in parallel', async () => {
			mockApiFetch
				.mockResolvedValueOnce({
					ok: true,
					json: async () => [{ id: 'store1' }]
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => [{ id: 'brand1' }]
				});

			const index = await db.loadIndex();

			expect(index.stores).toHaveLength(1);
			expect(index.brands).toHaveLength(1);
		});

		it('should cache index after first load', async () => {
			mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => []
			});

			await db.loadIndex();
			await db.loadIndex();

			// Should only call API once for stores and once for brands
			expect(mockApiFetch).toHaveBeenCalledTimes(2);
		});
	});
});
