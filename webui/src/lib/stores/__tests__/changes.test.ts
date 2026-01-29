import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get, writable } from 'svelte/store';

// Create mock isCloudMode store
const mockIsCloudMode = writable(true);

// Mock the dependencies
vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('./environment', () => ({
	isCloudMode: mockIsCloudMode
}));

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] || null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
		clear: vi.fn(() => {
			store = {};
		}),
		_getStore: () => ({ ...store }),
		_setStore: (newStore: Record<string, string>) => {
			store = { ...newStore };
		}
	};
})();

Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	writable: true
});

// Import after mocks are set up
import { changeStore, changeCount, hasChanges, changesList } from '../changes';

describe('Change Store', () => {
	beforeEach(() => {
		localStorageMock.clear();
		localStorageMock._setStore({});
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		localStorageMock.removeItem.mockClear();
		mockIsCloudMode.set(true);
		changeStore.clear();
	});

	describe('trackCreate', () => {
		it('should add create change entry', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			const data = { id: 'test', name: 'Test Brand' };

			changeStore.trackCreate(entity, data);

			const state = get(changeStore);
			expect(state.changes['brands/test']).toBeDefined();
			expect(state.changes['brands/test'].operation).toBe('create');
			expect(state.changes['brands/test'].data).toEqual(data);
		});

		it('should generate description', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			const data = { id: 'test', name: 'Test Brand' };

			changeStore.trackCreate(entity, data);

			const state = get(changeStore);
			expect(state.changes['brands/test'].description).toBe('Created brand "Test Brand"');
		});

		it('should persist to localStorage', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			const data = { id: 'test', name: 'Test Brand' };

			changeStore.trackCreate(entity, data);

			expect(localStorageMock.setItem).toHaveBeenCalled();
		});

		it('should do nothing in local mode', () => {
			mockIsCloudMode.set(false);

			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			const data = { id: 'test', name: 'Test Brand' };

			changeStore.trackCreate(entity, data);

			const state = get(changeStore);
			expect(state.changes['brands/test']).toBeUndefined();
		});
	});

	describe('trackUpdate', () => {
		it('should add update change entry', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			const oldData = { id: 'test', name: 'Old Name' };
			const newData = { id: 'test', name: 'New Name' };

			changeStore.trackUpdate(entity, oldData, newData);

			const state = get(changeStore);
			expect(state.changes['brands/test']).toBeDefined();
			expect(state.changes['brands/test'].operation).toBe('update');
			expect(state.changes['brands/test'].data).toEqual(newData);
		});

		it('should preserve original data', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			const oldData = { id: 'test', name: 'Original' };

			changeStore.trackUpdate(entity, oldData, { id: 'test', name: 'First Edit' });
			changeStore.trackUpdate(entity, { id: 'test', name: 'First Edit' }, { id: 'test', name: 'Second Edit' });

			const state = get(changeStore);
			expect(state.changes['brands/test'].originalData).toEqual(oldData);
		});

		it('should detect property changes', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			const oldData = { id: 'test', name: 'Old', website: 'old.com' };
			const newData = { id: 'test', name: 'New', website: 'new.com' };

			changeStore.trackUpdate(entity, oldData, newData);

			const state = get(changeStore);
			expect(state.changes['brands/test'].propertyChanges).toBeDefined();
			expect(state.changes['brands/test'].propertyChanges?.length).toBe(2);
		});

		it('should remove change if reverted to original', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			const original = { id: 'test', name: 'Original' };

			changeStore.trackUpdate(entity, original, { id: 'test', name: 'Changed' });
			expect(get(changeStore).changes['brands/test']).toBeDefined();

			changeStore.trackUpdate(entity, { id: 'test', name: 'Changed' }, { id: 'test', name: 'Original' });
			expect(get(changeStore).changes['brands/test']).toBeUndefined();
		});

		it('should update create entry data if entity was created in session', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			const createData = { id: 'test', name: 'Initial' };

			changeStore.trackCreate(entity, createData);
			changeStore.trackUpdate(entity, createData, { id: 'test', name: 'Updated' });

			const state = get(changeStore);
			expect(state.changes['brands/test'].operation).toBe('create');
			expect(state.changes['brands/test'].data.name).toBe('Updated');
		});
	});

	describe('trackDelete', () => {
		it('should add delete change entry', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };

			changeStore.trackDelete(entity, { name: 'Test Brand' });

			const state = get(changeStore);
			expect(state.changes['brands/test']).toBeDefined();
			expect(state.changes['brands/test'].operation).toBe('delete');
		});

		it('should remove create entry if entity was created in session', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };

			changeStore.trackCreate(entity, { id: 'test', name: 'Test' });
			expect(get(changeStore).changes['brands/test']).toBeDefined();

			changeStore.trackDelete(entity);
			expect(get(changeStore).changes['brands/test']).toBeUndefined();
		});

		it('should preserve for existing entities', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };

			// First track an update (not create)
			changeStore.trackUpdate(entity, { id: 'test', name: 'Old' }, { id: 'test', name: 'New' });
			changeStore.trackDelete(entity, { name: 'New' });

			const state = get(changeStore);
			expect(state.changes['brands/test'].operation).toBe('delete');
		});
	});

	describe('storeImage', () => {
		it('should store image data in separate localStorage key', () => {
			changeStore.storeImage('img-1', 'brands/test', 'logo', 'logo.png', 'image/png', 'base64data');

			expect(localStorageMock.setItem).toHaveBeenCalledWith('ofd_image_img-1', 'base64data');
		});

		it('should add image reference to change set', () => {
			changeStore.storeImage('img-1', 'brands/test', 'logo', 'logo.png', 'image/png', 'base64data');

			const state = get(changeStore);
			expect(state.images['img-1']).toBeDefined();
			expect(state.images['img-1'].filename).toBe('logo.png');
			expect(state.images['img-1'].mimeType).toBe('image/png');
		});
	});

	describe('getImage', () => {
		it('should retrieve image data', () => {
			localStorageMock._setStore({ 'ofd_image_img-1': 'storedData' });

			changeStore.storeImage('img-1', 'brands/test', 'logo', 'logo.png', 'image/png', 'storedData');

			const result = changeStore.getImage('img-1');
			expect(result).toBe('storedData');
		});

		it('should return null for non-existent image', () => {
			const result = changeStore.getImage('non-existent');
			expect(result).toBeNull();
		});
	});

	describe('removeChange', () => {
		it('should remove specific change', () => {
			const entity1 = { type: 'brand', id: 'test1', path: 'brands/test1' };
			const entity2 = { type: 'brand', id: 'test2', path: 'brands/test2' };

			changeStore.trackCreate(entity1, { id: 'test1', name: 'Brand 1' });
			changeStore.trackCreate(entity2, { id: 'test2', name: 'Brand 2' });

			changeStore.removeChange('brands/test1');

			const state = get(changeStore);
			expect(state.changes['brands/test1']).toBeUndefined();
			expect(state.changes['brands/test2']).toBeDefined();
		});

		it('should persist after removal', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			changeStore.trackCreate(entity, { id: 'test', name: 'Test' });

			localStorageMock.setItem.mockClear();
			changeStore.removeChange('brands/test');

			expect(localStorageMock.setItem).toHaveBeenCalled();
		});
	});

	describe('clear', () => {
		it('should remove all changes', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			changeStore.trackCreate(entity, { id: 'test', name: 'Test' });

			changeStore.clear();

			const state = get(changeStore);
			expect(Object.keys(state.changes).length).toBe(0);
		});

		it('should remove all image data', () => {
			changeStore.storeImage('img-1', 'brands/test', 'logo', 'logo.png', 'image/png', 'data');

			changeStore.clear();

			expect(localStorageMock.removeItem).toHaveBeenCalledWith('ofd_image_img-1');
		});

		it('should clear localStorage', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			changeStore.trackCreate(entity, { id: 'test', name: 'Test' });

			changeStore.clear();

			expect(localStorageMock.removeItem).toHaveBeenCalledWith('ofd_pending_changes');
		});
	});

	describe('exportChanges', () => {
		it('should include metadata', () => {
			const result = changeStore.exportChanges();

			expect(result.metadata).toBeDefined();
			expect(result.metadata.version).toBe('1.0.0');
			expect(result.metadata.exportedAt).toBeDefined();
		});

		it('should include all changes', () => {
			const entity = { type: 'brand', id: 'test', path: 'brands/test' };
			changeStore.trackCreate(entity, { id: 'test', name: 'Test' });

			const result = changeStore.exportChanges();

			expect(result.changes.length).toBe(1);
			expect(result.metadata.changeCount).toBe(1);
		});

		it('should embed image data', () => {
			localStorageMock._setStore({ 'ofd_image_img-1': 'imageData' });
			changeStore.storeImage('img-1', 'brands/test', 'logo', 'logo.png', 'image/png', 'imageData');

			const result = changeStore.exportChanges();

			expect(result.images['img-1']).toBeDefined();
			expect(result.images['img-1'].data).toBe('imageData');
		});
	});

	describe('getSummary', () => {
		it('should count by operation type', () => {
			changeStore.trackCreate({ type: 'brand', id: 'b1', path: 'brands/b1' }, { id: 'b1', name: 'Brand 1' });
			changeStore.trackUpdate(
				{ type: 'brand', id: 'b2', path: 'brands/b2' },
				{ id: 'b2', name: 'Old' },
				{ id: 'b2', name: 'New' }
			);
			changeStore.trackDelete({ type: 'brand', id: 'b3', path: 'brands/b3' }, { id: 'b3', name: 'Deleted' });

			const summary = changeStore.getSummary();

			expect(summary.total).toBe(3);
			expect(summary.creates).toBe(1);
			expect(summary.updates).toBe(1);
			expect(summary.deletes).toBe(1);
		});

		it('should count images', () => {
			changeStore.storeImage('img-1', 'brands/test', 'logo', 'logo.png', 'image/png', 'data');
			changeStore.storeImage('img-2', 'brands/test2', 'logo', 'logo.png', 'image/png', 'data');

			const summary = changeStore.getSummary();

			expect(summary.images).toBe(2);
		});
	});

	describe('Derived stores', () => {
		it('changeCount should reflect number of changes', () => {
			expect(get(changeCount)).toBe(0);

			changeStore.trackCreate({ type: 'brand', id: 'test', path: 'brands/test' }, { id: 'test', name: 'Test' });

			expect(get(changeCount)).toBe(1);
		});

		it('hasChanges should be true when changes exist', () => {
			expect(get(hasChanges)).toBe(false);

			changeStore.trackCreate({ type: 'brand', id: 'test', path: 'brands/test' }, { id: 'test', name: 'Test' });

			expect(get(hasChanges)).toBe(true);
		});

		it('changesList should sort by timestamp descending', () => {
			vi.useFakeTimers();

			changeStore.trackCreate({ type: 'brand', id: 'first', path: 'brands/first' }, { id: 'first', name: 'First' });
			vi.advanceTimersByTime(1000);
			changeStore.trackCreate({ type: 'brand', id: 'second', path: 'brands/second' }, { id: 'second', name: 'Second' });

			const list = get(changesList);

			expect(list[0].entity.id).toBe('second');
			expect(list[1].entity.id).toBe('first');

			vi.useRealTimers();
		});
	});
});

describe('findChangedProperties (via trackUpdate)', () => {
	beforeEach(() => {
		localStorageMock.clear();
		localStorageMock._setStore({});
		mockIsCloudMode.set(true);
		changeStore.clear();
	});

	it('should detect added properties', () => {
		const entity = { type: 'brand', id: 'test', path: 'brands/test' };
		const oldData = { name: 'Test' };
		const newData = { name: 'Test', website: 'test.com' };

		changeStore.trackUpdate(entity, oldData, newData);

		const state = get(changeStore);
		const changes = state.changes['brands/test'].propertyChanges;
		expect(changes?.some((c) => c.property === 'website')).toBe(true);
	});

	it('should detect removed properties', () => {
		const entity = { type: 'brand', id: 'test', path: 'brands/test' };
		const oldData = { name: 'Test', website: 'test.com' };
		const newData = { name: 'Test' };

		changeStore.trackUpdate(entity, oldData, newData);

		const state = get(changeStore);
		const changes = state.changes['brands/test'].propertyChanges;
		expect(changes?.some((c) => c.property === 'website')).toBe(true);
	});

	it('should detect modified properties', () => {
		const entity = { type: 'brand', id: 'test', path: 'brands/test' };
		const oldData = { name: 'Old Name' };
		const newData = { name: 'New Name' };

		changeStore.trackUpdate(entity, oldData, newData);

		const state = get(changeStore);
		const changes = state.changes['brands/test'].propertyChanges;
		const nameChange = changes?.find((c) => c.property === 'name');
		expect(nameChange).toBeDefined();
		expect(nameChange?.oldValue).toBe('Old Name');
		expect(nameChange?.newValue).toBe('New Name');
	});

	it('should recurse into nested objects', () => {
		const entity = { type: 'filament', id: 'test', path: 'filaments/test' };
		const oldData = { name: 'Test', settings: { temp: 200 } };
		const newData = { name: 'Test', settings: { temp: 210 } };

		changeStore.trackUpdate(entity, oldData, newData);

		const state = get(changeStore);
		const changes = state.changes['filaments/test'].propertyChanges;
		expect(changes?.some((c) => c.property === 'settings.temp')).toBe(true);
	});

	it('should skip internal fields (id, slug, logo)', () => {
		const entity = { type: 'brand', id: 'test', path: 'brands/test' };
		const oldData = { id: 'test', slug: 'test', logo: 'old.png', name: 'Old' };
		const newData = { id: 'test2', slug: 'test2', logo: 'new.png', name: 'New' };

		changeStore.trackUpdate(entity, oldData, newData);

		const state = get(changeStore);
		const changes = state.changes['brands/test'].propertyChanges;
		expect(changes?.some((c) => c.property === 'id')).toBe(false);
		expect(changes?.some((c) => c.property === 'slug')).toBe(false);
		expect(changes?.some((c) => c.property === 'logo')).toBe(false);
		expect(changes?.some((c) => c.property === 'name')).toBe(true);
	});

	it('should handle null/undefined/empty equivalence', () => {
		const entity = { type: 'brand', id: 'test', path: 'brands/test' };
		const oldData = { name: 'Test', field: null };
		const newData = { name: 'Test', field: undefined };

		changeStore.trackUpdate(entity, oldData, newData);

		// Should be reverted since null and undefined are equivalent
		const state = get(changeStore);
		expect(state.changes['brands/test']).toBeUndefined();
	});
});
