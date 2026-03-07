import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before imports, so mocks are ready when database.ts loads
const mocks = vi.hoisted(() => {
	// Minimal writable implementation for hoisted context (can't use svelte/store here)
	function createWritable<T>(initial: T) {
		let value = initial;
		const subs = new Set<(v: T) => void>();
		return {
			subscribe(fn: (v: T) => void) {
				fn(value);
				subs.add(fn);
				return () => { subs.delete(fn); };
			},
			set(v: T) {
				value = v;
				for (const fn of subs) fn(v);
			},
			update(fn: (v: T) => T) {
				value = fn(value);
				for (const sub of subs) sub(value);
			}
		};
	}

	/**
	 * Build a TreeChangeSet-compatible object from a flat changes record.
	 * The database.ts code accesses tree.stores, tree.brands, _index,
	 * and navigates children for nested paths.
	 */
	function buildTreeChangeSet(flatChanges: Record<string, { operation: string; data?: any; originalData?: any }>, images: Record<string, any> = {}) {
		const tree: { stores: Record<string, any>; brands: Record<string, any> } = { stores: {}, brands: {} };
		const _index = new Map<string, any>();

		for (const [path, change] of Object.entries(flatChanges)) {
			const parts = path.split('/');
			const node: any = { key: parts[parts.length - 1], path, change, children: {} };
			_index.set(path, node);

			if (parts[0] === 'stores' && parts.length === 2) {
				tree.stores[parts[1]] = node;
			} else if (parts[0] === 'brands') {
				if (parts.length === 2) {
					// Direct brand node
					if (!tree.brands[parts[1]]) {
						tree.brands[parts[1]] = node;
					} else {
						// Merge change into existing node
						tree.brands[parts[1]].change = change;
					}
				} else if (parts.length >= 4) {
					// Nested: brands/{brand}/{namespace}/{child}/...
					// Ensure parent brand node exists
					if (!tree.brands[parts[1]]) {
						tree.brands[parts[1]] = { key: parts[1], path: `brands/${parts[1]}`, children: {} };
						_index.set(`brands/${parts[1]}`, tree.brands[parts[1]]);
					}
					const brandNode = tree.brands[parts[1]];
					// Create namespace node (e.g. 'materials') as ChangeTreeNode
					const namespace = parts[2];
					if (!brandNode.children[namespace]) {
						brandNode.children[namespace] = {
							key: namespace,
							path: `brands/${parts[1]}/${namespace}`,
							children: {}
						};
					}
					const nsNode = brandNode.children[namespace];
					nsNode.children[parts[3]] = node;
				}
			}
		}

		return { tree, _index, images, lastModified: Date.now(), version: 2 };
	}

	return {
		mockUseChangeTracking: createWritable(false),
		mockChangeStore: createWritable(buildTreeChangeSet({})),
		buildTreeChangeSet,
		mockApiFetch: vi.fn(),
		mockTrackCreate: vi.fn(),
		mockTrackUpdate: vi.fn(),
		mockTrackDelete: vi.fn()
	};
});

vi.mock('$lib/stores/environment', () => ({
	useChangeTracking: mocks.mockUseChangeTracking
}));

vi.mock('$lib/stores/changes', () => ({
	changeStore: {
		subscribe: (fn: (value: any) => void) => mocks.mockChangeStore.subscribe(fn),
		trackCreate: mocks.mockTrackCreate,
		trackUpdate: mocks.mockTrackUpdate,
		trackDelete: mocks.mockTrackDelete
	}
}));

vi.mock('$lib/utils/api', () => ({
	apiFetch: (...args: any[]) => mocks.mockApiFetch(...args)
}));

// Import after mocks
import { DatabaseService } from '../database';

describe('DatabaseService', () => {
	let db: DatabaseService;

	beforeEach(() => {
		// Reset singleton by accessing private property
		(DatabaseService as any).instance = undefined;
		db = DatabaseService.getInstance();

		mocks.mockUseChangeTracking.set(false);
		mocks.mockChangeStore.set(mocks.buildTreeChangeSet({}));
		mocks.mockApiFetch.mockReset();
		mocks.mockTrackCreate.mockClear();
		mocks.mockTrackUpdate.mockClear();
		mocks.mockTrackDelete.mockClear();
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
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => stores
			});

			const result = await db.loadStores();

			expect(mocks.mockApiFetch).toHaveBeenCalledWith('/api/stores');
			expect(result).toEqual(stores);
		});

		it('should layer cloud mode changes', async () => {
			mocks.mockUseChangeTracking.set(true);
			const baseStores = [{ id: 'store1', slug: 'store1', name: 'Store 1' }];
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseStores
			});

			// Add a create change
			mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
					'stores/store2': {
						operation: 'create',
						data: { id: 'store2', slug: 'store2', name: 'Store 2' }
					}
				}));

			const result = await db.loadStores();

			expect(result).toHaveLength(2);
			expect(result.find((s) => s.id === 'store2')).toBeDefined();
		});

		it('should throw on error', async () => {
			mocks.mockApiFetch.mockRejectedValue(new Error('Network error'));

			await expect(db.loadStores()).rejects.toThrow('Network error');
		});
	});

	describe('loadBrands', () => {
		it('should fetch brands from API', async () => {
			const brands = [{ id: 'brand1', name: 'Brand 1' }];
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => brands
			});

			const result = await db.loadBrands();

			expect(mocks.mockApiFetch).toHaveBeenCalledWith('/api/brands');
			expect(result).toEqual(brands);
		});

		it('should layer cloud mode changes', async () => {
			mocks.mockUseChangeTracking.set(true);
			const baseBrands = [{ id: 'brand1', name: 'Brand 1' }];
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseBrands
			});

			mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
					'brands/brand1': {
						operation: 'update',
						data: { id: 'brand1', name: 'Updated Brand 1' },
						originalData: { id: 'brand1', name: 'Brand 1' }
					}
				}));

			const result = await db.loadBrands();

			expect(result[0].name).toBe('Updated Brand 1');
		});
	});

	describe('getStore', () => {
		it('should return store by ID', async () => {
			const store = { id: 'store1', name: 'Test Store' };
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => store
			});

			const result = await db.getStore('store1');

			expect(result).toEqual(store);
		});

		it('should return locally created store in cloud mode', async () => {
			mocks.mockUseChangeTracking.set(true);
			mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
					'stores/new-store': {
						operation: 'create',
						data: { id: 'new-store', name: 'New Store' }
					}
				}));

			const result = await db.getStore('new-store');

			expect(result?.name).toBe('New Store');
			// Should not call API for locally created entity
			expect(mocks.mockApiFetch).not.toHaveBeenCalled();
		});

		it('should apply changes to fetched store', async () => {
			mocks.mockUseChangeTracking.set(true);
			const baseStore = { id: 'store1', name: 'Original Name' };
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseStore
			});

			mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
					'stores/store1': {
						operation: 'update',
						data: { id: 'store1', name: 'Updated Name' }
					}
				}));

			const result = await db.getStore('store1');

			expect(result?.name).toBe('Updated Name');
		});

		it('should return null for non-existent store', async () => {
			mocks.mockApiFetch.mockResolvedValue({
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
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => brand
			});

			const result = await db.getBrand('brand1');

			expect(result).toEqual(brand);
		});

		it('should return locally created brand in cloud mode', async () => {
			mocks.mockUseChangeTracking.set(true);
			mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
					'brands/new-brand': {
						operation: 'create',
						data: { id: 'new-brand', name: 'New Brand' }
					}
				}));

			const result = await db.getBrand('new-brand');

			expect(result?.name).toBe('New Brand');
			expect(mocks.mockApiFetch).not.toHaveBeenCalled();
		});

		it('should return null for deleted brand in cloud mode', async () => {
			mocks.mockUseChangeTracking.set(true);
			const baseBrand = { id: 'brand1', name: 'Test Brand' };
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseBrand
			});

			mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
					'brands/brand1': {
						operation: 'delete'
					}
				}));

			const result = await db.getBrand('brand1');

			expect(result).toBeNull();
		});
	});

	describe('saveStore', () => {
		const store = { id: 'store1', name: 'Test Store' } as any;

		it('should track create in cloud mode for new store', async () => {
			mocks.mockUseChangeTracking.set(true);

			const result = await db.saveStore(store);

			expect(result).toBe(true);
			expect(mocks.mockTrackCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'store',
					path: 'stores/store1',
					id: 'store1'
				}),
				store
			);
		});

		it('should track update in cloud mode for existing store', async () => {
			mocks.mockUseChangeTracking.set(true);
			const oldStore = { id: 'store1', name: 'Old Name' } as any;
			const newStore = { id: 'store1', name: 'New Name' } as any;

			await db.saveStore(newStore, oldStore);

			expect(mocks.mockTrackUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ path: 'stores/store1' }),
				oldStore,
				newStore
			);
		});

		it('should call API in local mode', async () => {
			mocks.mockUseChangeTracking.set(false);
			mocks.mockApiFetch.mockResolvedValue({ ok: true });

			const result = await db.saveStore(store);

			expect(result).toBe(true);
			expect(mocks.mockApiFetch).toHaveBeenCalledWith(
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
			mocks.mockUseChangeTracking.set(true);

			const result = await db.saveBrand(brand);

			expect(result).toBe(true);
			expect(mocks.mockTrackCreate).toHaveBeenCalled();
		});

		it('should track update in cloud mode for existing brand', async () => {
			mocks.mockUseChangeTracking.set(true);
			const oldBrand = { id: 'brand1', name: 'Old' } as any;

			await db.saveBrand(brand, oldBrand);

			expect(mocks.mockTrackUpdate).toHaveBeenCalled();
		});

		it('should call API in local mode', async () => {
			mocks.mockUseChangeTracking.set(false);
			mocks.mockApiFetch.mockResolvedValue({ ok: true });

			await db.saveBrand(brand);

			expect(mocks.mockApiFetch).toHaveBeenCalledWith(
				'/api/brands/brand1',
				expect.objectContaining({ method: 'PUT' })
			);
		});
	});

	describe('deleteStore', () => {
		it('should track delete in cloud mode', async () => {
			mocks.mockUseChangeTracking.set(true);
			const store = { id: 'store1', name: 'Test' } as any;

			const result = await db.deleteStore('store1', store);

			expect(result).toBe(true);
			expect(mocks.mockTrackDelete).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'store',
					path: 'stores/store1',
					id: 'store1'
				}),
				store
			);
		});

		it('should call DELETE API in local mode', async () => {
			mocks.mockUseChangeTracking.set(false);
			mocks.mockApiFetch.mockResolvedValue({ ok: true });

			const result = await db.deleteStore('store1');

			expect(result).toBe(true);
			expect(mocks.mockApiFetch).toHaveBeenCalledWith('/api/stores/store1', { method: 'DELETE' });
		});
	});

	describe('deleteBrand', () => {
		it('should track delete in cloud mode', async () => {
			mocks.mockUseChangeTracking.set(true);
			const brand = { id: 'brand1', name: 'Test' } as any;

			const result = await db.deleteBrand('brand1', brand);

			expect(result).toBe(true);
			expect(mocks.mockTrackDelete).toHaveBeenCalled();
		});

		it('should call DELETE API in local mode', async () => {
			mocks.mockUseChangeTracking.set(false);
			mocks.mockApiFetch.mockResolvedValue({ ok: true });

			await db.deleteBrand('brand1');

			expect(mocks.mockApiFetch).toHaveBeenCalledWith('/api/brands/brand1', { method: 'DELETE' });
		});
	});

	describe('loadMaterials', () => {
		it('should load materials for brand', async () => {
			const materials = [{ id: 'PLA', material: 'PLA' }];
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => materials
			});

			const result = await db.loadMaterials('test-brand');

			expect(mocks.mockApiFetch).toHaveBeenCalledWith('/api/brands/test-brand/materials');
			expect(result).toEqual(materials);
		});

		it('should show locally created materials even when API fails', async () => {
			mocks.mockUseChangeTracking.set(true);
			mocks.mockApiFetch.mockResolvedValue({
				ok: false,
				statusText: 'Not Found'
			});

			mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
					'brands/new-brand': {
						operation: 'create',
						data: { id: 'new-brand', name: 'New Brand' }
					},
					'brands/new-brand/materials/PLA': {
						operation: 'create',
						data: { id: 'PLA', material: 'PLA', materialType: 'PLA' }
					}
				}));

			const result = await db.loadMaterials('new-brand');

			expect(result).toHaveLength(1);
			expect(result[0].material).toBe('PLA');
		});
	});

	describe('layerChanges (via load methods)', () => {
		beforeEach(() => {
			mocks.mockUseChangeTracking.set(true);
		});

		describe('create operations', () => {
			it('should add new entity from changes', async () => {
				mocks.mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'existing', slug: 'existing', name: 'Existing' }]
				});

				mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
						'brands/new': {
							operation: 'create',
							data: { id: 'new', slug: 'new', name: 'New Brand' }
						}
					}));

				const result = await db.loadBrands();

				expect(result).toHaveLength(2);
				expect(result.find((b) => b.id === 'new')).toBeDefined();
			});

			it('should not duplicate if entity already exists', async () => {
				mocks.mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'test', slug: 'test', name: 'Original' }]
				});

				mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
						'brands/test': {
							operation: 'create',
							data: { id: 'test', slug: 'test', name: 'Created' }
						}
					}));

				const result = await db.loadBrands();

				// Should have the created version
				expect(result).toHaveLength(1);
				expect(result[0].name).toBe('Created');
			});
		});

		describe('update operations', () => {
			it('should replace existing entity with changed data', async () => {
				mocks.mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'test', slug: 'test', name: 'Original' }]
				});

				mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
						'brands/test': {
							operation: 'update',
							data: { id: 'test', slug: 'test', name: 'Updated' }
						}
					}));

				const result = await db.loadBrands();

				expect(result[0].name).toBe('Updated');
			});

			it('should handle entity ID change', async () => {
				mocks.mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'old-id', slug: 'old-id', name: 'Test' }]
				});

				mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
						'brands/old-id': {
							operation: 'update',
							data: { id: 'new-id', slug: 'new-id', name: 'Renamed' }
						}
					}));

				const result = await db.loadBrands();

				expect(result).toHaveLength(1);
				expect(result[0].id).toBe('new-id');
			});
		});

		describe('delete operations', () => {
			it('should remove entity from result', async () => {
				mocks.mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [
						{ id: 'keep', slug: 'keep', name: 'Keep' },
						{ id: 'delete', slug: 'delete', name: 'Delete' }
					]
				});

				mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
						'brands/delete': {
							operation: 'delete'
						}
					}));

				const result = await db.loadBrands();

				expect(result).toHaveLength(1);
				expect(result[0].id).toBe('keep');
			});

			it('should use case-insensitive matching for deletion', async () => {
				mocks.mockApiFetch.mockResolvedValue({
					ok: true,
					json: async () => [{ id: 'TestBrand', slug: 'TestBrand', name: 'Test' }]
				});

				mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
						'brands/testbrand': {
							operation: 'delete'
						}
					}));

				const result = await db.loadBrands();

				expect(result).toHaveLength(0);
			});
		});

		it('should return base data unmodified in local mode', async () => {
			mocks.mockUseChangeTracking.set(false);
			const baseBrands = [{ id: 'test', name: 'Original' }];
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => baseBrands
			});

			mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
					'brands/test': {
						operation: 'update',
						data: { id: 'test', name: 'Updated' }
					}
				}));

			const result = await db.loadBrands();

			// When change tracking is off, changes are not layered
			expect(result[0].name).toBe('Original');
		});

		it('should only apply direct child changes (not nested)', async () => {
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => [{ id: 'brand1', slug: 'brand1', name: 'Brand 1' }]
			});

			mocks.mockChangeStore.set(mocks.buildTreeChangeSet({
					// Direct child - should be applied
					'brands/new-brand': {
						operation: 'create',
						data: { id: 'new-brand', slug: 'new-brand', name: 'New Brand' }
					},
					// Nested change - should NOT be applied to brands list
					'brands/brand1/materials/PLA': {
						operation: 'create',
						data: { id: 'PLA', material: 'PLA' }
					}
				}));

			const result = await db.loadBrands();

			expect(result).toHaveLength(2);
			// The nested material change should not create a new brand entry
			expect(result.find((b) => b.id === 'PLA')).toBeUndefined();
		});
	});

	describe('loadIndex', () => {
		it('should load stores and brands in parallel', async () => {
			mocks.mockApiFetch
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
			mocks.mockApiFetch.mockResolvedValue({
				ok: true,
				json: async () => []
			});

			await db.loadIndex();
			await db.loadIndex();

			// Should only call API once for stores and once for brands
			expect(mocks.mockApiFetch).toHaveBeenCalledTimes(2);
		});
	});
});
