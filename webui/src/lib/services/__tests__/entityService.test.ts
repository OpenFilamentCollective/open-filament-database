import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writable } from 'svelte/store';
import {
	generateSlug,
	generateMaterialType,
	hasLocalChanges,
	isLocallyCreated,
	deleteEntity,
	mergeEntityData
} from '../entityService';

// Mock the stores
const mockChangeStore = {
	changes: {} as Record<string, { operation: string; data?: any }>,
	removeChange: vi.fn()
};

const mockIsCloudMode = writable(false);

vi.mock('$lib/stores/changes', () => ({
	changeStore: {
		subscribe: (fn: (value: any) => void) => {
			fn(mockChangeStore);
			return () => {};
		},
		removeChange: (...args: any[]) => mockChangeStore.removeChange(...args)
	}
}));

vi.mock('$lib/stores/environment', () => ({
	isCloudMode: {
		subscribe: (fn: (value: boolean) => void) => {
			let value = false;
			mockIsCloudMode.subscribe((v) => {
				value = v;
			});
			fn(value);
			return mockIsCloudMode.subscribe(fn);
		}
	}
}));

describe('Entity Service', () => {
	beforeEach(() => {
		mockChangeStore.changes = {};
		mockChangeStore.removeChange.mockClear();
		mockIsCloudMode.set(false);
	});

	describe('generateSlug', () => {
		it('should convert to lowercase', () => {
			expect(generateSlug('TestBrand')).toBe('testbrand');
			expect(generateSlug('UPPERCASE')).toBe('uppercase');
		});

		it('should replace spaces and special chars with hyphens', () => {
			expect(generateSlug('Test Brand')).toBe('test-brand');
			expect(generateSlug('Test & Brand!')).toBe('test-brand');
			expect(generateSlug('Test@Brand#Name')).toBe('test-brand-name');
		});

		it('should remove leading/trailing hyphens', () => {
			expect(generateSlug(' Test Brand ')).toBe('test-brand');
			expect(generateSlug('--test--')).toBe('test');
			expect(generateSlug('!Test!')).toBe('test');
		});

		it('should handle multiple consecutive special chars', () => {
			expect(generateSlug('Test   Brand')).toBe('test-brand');
			expect(generateSlug('Test---Brand')).toBe('test-brand');
			expect(generateSlug('Test   @#$  Brand')).toBe('test-brand');
		});

		it('should handle numbers', () => {
			expect(generateSlug('Brand123')).toBe('brand123');
			expect(generateSlug('123Brand')).toBe('123brand');
		});
	});

	describe('generateMaterialType', () => {
		it('should convert to uppercase', () => {
			expect(generateMaterialType('pla')).toBe('PLA');
			expect(generateMaterialType('petg')).toBe('PETG');
		});

		it('should replace special chars with hyphens', () => {
			expect(generateMaterialType('pla plus')).toBe('PLA-PLUS');
			expect(generateMaterialType('carbon fiber')).toBe('CARBON-FIBER');
		});

		it('should handle existing uppercase input', () => {
			expect(generateMaterialType('PLA')).toBe('PLA');
			expect(generateMaterialType('PETG')).toBe('PETG');
		});

		it('should remove leading/trailing hyphens', () => {
			expect(generateMaterialType(' pla ')).toBe('PLA');
			expect(generateMaterialType('--abs--')).toBe('ABS');
		});
	});

	describe('hasLocalChanges', () => {
		it('should return false in local mode', () => {
			mockIsCloudMode.set(false);
			mockChangeStore.changes = { 'brands/test': { operation: 'update' } };

			expect(hasLocalChanges('brands/test')).toBe(false);
		});

		it('should return true for create operation in cloud mode', () => {
			mockIsCloudMode.set(true);
			mockChangeStore.changes = { 'brands/test': { operation: 'create' } };

			expect(hasLocalChanges('brands/test')).toBe(true);
		});

		it('should return true for update operation in cloud mode', () => {
			mockIsCloudMode.set(true);
			mockChangeStore.changes = { 'brands/test': { operation: 'update' } };

			expect(hasLocalChanges('brands/test')).toBe(true);
		});

		it('should return false for delete operation', () => {
			mockIsCloudMode.set(true);
			mockChangeStore.changes = { 'brands/test': { operation: 'delete' } };

			expect(hasLocalChanges('brands/test')).toBe(false);
		});

		it('should return false for no changes', () => {
			mockIsCloudMode.set(true);
			mockChangeStore.changes = {};

			expect(hasLocalChanges('brands/test')).toBe(false);
		});
	});

	describe('isLocallyCreated', () => {
		it('should return true only for create operation in cloud mode', () => {
			mockIsCloudMode.set(true);
			mockChangeStore.changes = { 'brands/test': { operation: 'create' } };

			expect(isLocallyCreated('brands/test')).toBe(true);
		});

		it('should return false for updates', () => {
			mockIsCloudMode.set(true);
			mockChangeStore.changes = { 'brands/test': { operation: 'update' } };

			expect(isLocallyCreated('brands/test')).toBe(false);
		});

		it('should return false in local mode', () => {
			mockIsCloudMode.set(false);
			mockChangeStore.changes = { 'brands/test': { operation: 'create' } };

			expect(isLocallyCreated('brands/test')).toBe(false);
		});
	});

	describe('deleteEntity', () => {
		describe('Cloud mode', () => {
			beforeEach(() => {
				mockIsCloudMode.set(true);
			});

			it('should remove local create without API call', async () => {
				mockChangeStore.changes = { 'brands/test': { operation: 'create' } };
				const deleteFn = vi.fn().mockResolvedValue(true);

				const result = await deleteEntity('brands/test', 'Brand', deleteFn);

				expect(result.success).toBe(true);
				expect(result.isLocalRemoval).toBe(true);
				expect(mockChangeStore.removeChange).toHaveBeenCalledWith('brands/test');
				expect(deleteFn).not.toHaveBeenCalled();
			});

			it('should mark existing entity for deletion', async () => {
				mockChangeStore.changes = {};
				const deleteFn = vi.fn().mockResolvedValue(true);

				const result = await deleteEntity('brands/test', 'Brand', deleteFn);

				expect(result.success).toBe(true);
				expect(result.message).toContain('marked for deletion');
				expect(deleteFn).toHaveBeenCalled();
			});

			it('should return isLocalRemoval flag for created entities', async () => {
				mockChangeStore.changes = { 'brands/test': { operation: 'create' } };
				const deleteFn = vi.fn();

				const result = await deleteEntity('brands/test', 'Brand', deleteFn);

				expect(result.isLocalRemoval).toBe(true);
			});
		});

		describe('Local mode', () => {
			beforeEach(() => {
				mockIsCloudMode.set(false);
			});

			it('should call delete function', async () => {
				const deleteFn = vi.fn().mockResolvedValue(true);

				await deleteEntity('brands/test', 'Brand', deleteFn);

				expect(deleteFn).toHaveBeenCalled();
			});

			it('should return success status on successful deletion', async () => {
				const deleteFn = vi.fn().mockResolvedValue(true);

				const result = await deleteEntity('brands/test', 'Brand', deleteFn);

				expect(result.success).toBe(true);
				expect(result.message).toContain('deleted successfully');
			});

			it('should return failure status on failed deletion', async () => {
				const deleteFn = vi.fn().mockResolvedValue(false);

				const result = await deleteEntity('brands/test', 'Brand', deleteFn);

				expect(result.success).toBe(false);
				expect(result.message).toContain('Failed to delete');
			});
		});
	});

	describe('mergeEntityData', () => {
		it('should merge form data over existing', () => {
			const existing = { id: 'test', name: 'Old Name', website: 'old.com' };
			const formData = { name: 'New Name', website: 'new.com' };

			const result = mergeEntityData(existing, formData);

			expect(result.name).toBe('New Name');
			expect(result.website).toBe('new.com');
		});

		it('should preserve specified fields (id, slug by default)', () => {
			const existing = { id: 'original-id', slug: 'original-slug', name: 'Old Name' };
			const formData = { id: 'new-id', slug: 'new-slug', name: 'New Name' };

			const result = mergeEntityData(existing, formData);

			expect(result.id).toBe('original-id');
			expect(result.slug).toBe('original-slug');
			expect(result.name).toBe('New Name');
		});

		it('should handle custom preserve fields', () => {
			const existing = { id: 'test', name: 'Old', custom: 'preserved' };
			const formData = { name: 'New', custom: 'changed' };

			const result = mergeEntityData(existing, formData, ['id', 'custom']);

			expect(result.id).toBe('test');
			expect(result.custom).toBe('preserved');
			expect(result.name).toBe('New');
		});

		it('should not preserve fields that are undefined in existing', () => {
			const existing = { id: 'test', name: 'Name' } as Record<string, unknown>;
			const formData = { name: 'New Name', slug: 'new-slug' };

			const result = mergeEntityData(existing, formData, ['id', 'slug']);

			expect(result.slug).toBe('new-slug');
		});
	});
});
