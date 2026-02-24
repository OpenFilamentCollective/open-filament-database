import { describe, it, expect } from 'vitest';
import path from 'path';
import {
	entityPathToFsPath,
	entityPathToDir,
	cleanEntityData,
	SAFE_SEGMENT,
	STRIP_FIELDS,
	DATA_DIR,
	STORES_DIR
} from '../saveUtils';

describe('saveUtils', () => {
	describe('SAFE_SEGMENT regex', () => {
		it('should accept simple alphanumeric slugs', () => {
			expect(SAFE_SEGMENT.test('prusament')).toBe(true);
			expect(SAFE_SEGMENT.test('PLA')).toBe(true);
			expect(SAFE_SEGMENT.test('brand1')).toBe(true);
		});

		it('should accept slugs with hyphens, underscores, dots, and spaces', () => {
			expect(SAFE_SEGMENT.test('my-brand')).toBe(true);
			expect(SAFE_SEGMENT.test('my_brand')).toBe(true);
			expect(SAFE_SEGMENT.test('my.brand')).toBe(true);
			expect(SAFE_SEGMENT.test('my brand')).toBe(true);
		});

		it('should reject segments starting with non-alphanumeric characters', () => {
			expect(SAFE_SEGMENT.test('.hidden')).toBe(false);
			expect(SAFE_SEGMENT.test('-dash')).toBe(false);
			expect(SAFE_SEGMENT.test('_underscore')).toBe(false);
			expect(SAFE_SEGMENT.test(' space')).toBe(false);
		});

		it('should reject path traversal segments', () => {
			expect(SAFE_SEGMENT.test('..')).toBe(false);
			expect(SAFE_SEGMENT.test('.')).toBe(false);
		});

		it('should reject empty strings', () => {
			expect(SAFE_SEGMENT.test('')).toBe(false);
		});

		it('should reject segments with special characters', () => {
			expect(SAFE_SEGMENT.test('foo/bar')).toBe(false);
			expect(SAFE_SEGMENT.test('foo\\bar')).toBe(false);
			expect(SAFE_SEGMENT.test('foo\0bar')).toBe(false);
		});
	});

	describe('entityPathToFsPath', () => {
		it('should map store paths correctly', () => {
			const result = entityPathToFsPath('stores/acme');
			expect(result).toBe(path.join(STORES_DIR, 'acme', 'store.json'));
		});

		it('should map brand paths correctly', () => {
			const result = entityPathToFsPath('brands/prusament');
			expect(result).toBe(path.join(DATA_DIR, 'prusament', 'brand.json'));
		});

		it('should map material paths correctly', () => {
			const result = entityPathToFsPath('brands/prusament/materials/PLA');
			expect(result).toBe(path.join(DATA_DIR, 'prusament', 'PLA', 'material.json'));
		});

		it('should map filament paths correctly', () => {
			const result = entityPathToFsPath('brands/prusament/materials/PLA/filaments/galaxy-black');
			expect(result).toBe(path.join(DATA_DIR, 'prusament', 'PLA', 'galaxy-black', 'filament.json'));
		});

		it('should map variant paths correctly', () => {
			const result = entityPathToFsPath('brands/prusament/materials/PLA/filaments/galaxy-black/variants/1kg');
			expect(result).toBe(path.join(DATA_DIR, 'prusament', 'PLA', 'galaxy-black', '1kg', 'variant.json'));
		});

		it('should return null for unrecognized patterns', () => {
			expect(entityPathToFsPath('unknown/foo')).toBeNull();
			expect(entityPathToFsPath('brands')).toBeNull();
			expect(entityPathToFsPath('brands/a/b')).toBeNull();
			expect(entityPathToFsPath('brands/a/materials/b/unknown/c')).toBeNull();
		});

		it('should return null for paths with .. segments', () => {
			expect(entityPathToFsPath('brands/../etc')).toBeNull();
			expect(entityPathToFsPath('stores/..')).toBeNull();
		});

		it('should return null for paths with empty segments', () => {
			expect(entityPathToFsPath('brands//prusament')).toBeNull();
			expect(entityPathToFsPath('/brands/prusament')).toBeNull();
		});

		it('should return null for paths with special characters in segments', () => {
			expect(entityPathToFsPath('brands/foo\0bar')).toBeNull();
			expect(entityPathToFsPath('stores/foo\\bar')).toBeNull();
		});

		it('should return null for single segment paths (except valid patterns)', () => {
			expect(entityPathToFsPath('brands')).toBeNull();
			expect(entityPathToFsPath('stores')).toBeNull();
		});
	});

	describe('entityPathToDir', () => {
		it('should return the directory for valid store paths', () => {
			const result = entityPathToDir('stores/acme');
			expect(result).toBe(path.join(STORES_DIR, 'acme'));
		});

		it('should return the directory for valid brand paths', () => {
			const result = entityPathToDir('brands/prusament');
			expect(result).toBe(path.join(DATA_DIR, 'prusament'));
		});

		it('should return the directory for valid material paths', () => {
			const result = entityPathToDir('brands/prusament/materials/PLA');
			expect(result).toBe(path.join(DATA_DIR, 'prusament', 'PLA'));
		});

		it('should return null for invalid paths', () => {
			expect(entityPathToDir('unknown/foo')).toBeNull();
			expect(entityPathToDir('brands/../etc')).toBeNull();
		});
	});

	describe('cleanEntityData', () => {
		it('should pass through normal fields', () => {
			const data = { name: 'Test Brand', origin: 'Germany' };
			expect(cleanEntityData(data)).toEqual({ name: 'Test Brand', origin: 'Germany' });
		});

		it('should strip internal tracking fields', () => {
			const data = {
				name: 'Test',
				brandId: 'test',
				brand_id: 'test',
				materialType: 'PLA',
				filamentDir: 'galaxy-black',
				filament_id: 'galaxy-black',
				slug: 'test'
			};
			expect(cleanEntityData(data)).toEqual({ name: 'Test' });
		});

		it('should strip empty string values', () => {
			const data = { name: 'Test', website: '', description: '' };
			expect(cleanEntityData(data)).toEqual({ name: 'Test' });
		});

		it('should not strip null or undefined values', () => {
			const data = { name: 'Test', website: null, count: undefined };
			expect(cleanEntityData(data)).toEqual({ name: 'Test', website: null, count: undefined });
		});

		it('should preserve numeric zero values', () => {
			const data = { name: 'Test', count: 0 };
			expect(cleanEntityData(data)).toEqual({ name: 'Test', count: 0 });
		});

		it('should preserve boolean false values', () => {
			const data = { name: 'Test', active: false };
			expect(cleanEntityData(data)).toEqual({ name: 'Test', active: false });
		});

		it('should preserve nested objects and arrays', () => {
			const data = { name: 'Test', tags: ['a', 'b'], meta: { key: 'val' } };
			expect(cleanEntityData(data)).toEqual({ name: 'Test', tags: ['a', 'b'], meta: { key: 'val' } });
		});

		it('should not modify the input object', () => {
			const data = { name: 'Test', brandId: 'test' };
			cleanEntityData(data);
			expect(data).toEqual({ name: 'Test', brandId: 'test' });
		});

		it('should not silently default origin field', () => {
			const data = { name: 'Test', origin: '' };
			const result = cleanEntityData(data);
			expect(result).not.toHaveProperty('origin');
		});
	});

	describe('STRIP_FIELDS', () => {
		it('should contain all expected tracking fields', () => {
			expect(STRIP_FIELDS.has('brandId')).toBe(true);
			expect(STRIP_FIELDS.has('brand_id')).toBe(true);
			expect(STRIP_FIELDS.has('materialType')).toBe(true);
			expect(STRIP_FIELDS.has('filamentDir')).toBe(true);
			expect(STRIP_FIELDS.has('filament_id')).toBe(true);
			expect(STRIP_FIELDS.has('slug')).toBe(true);
		});

		it('should not contain non-tracking fields', () => {
			expect(STRIP_FIELDS.has('name')).toBe(false);
			expect(STRIP_FIELDS.has('origin')).toBe(false);
			expect(STRIP_FIELDS.has('logo')).toBe(false);
		});
	});
});
