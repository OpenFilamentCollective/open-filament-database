import { describe, it, expect } from 'vitest';
import path from 'path';
import {
	entityPathToFsPath,
	entityPathToDir,
	cleanEntityData,
	preserveCanonicalFields,
	isUuidSegment,
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

		it('should accept slugs with hyphens, underscores, and dots', () => {
			expect(SAFE_SEGMENT.test('my-brand')).toBe(true);
			expect(SAFE_SEGMENT.test('my_brand')).toBe(true);
			expect(SAFE_SEGMENT.test('my.brand')).toBe(true);
		});

		it('should accept slugs with a plus sign after the first character', () => {
			expect(SAFE_SEGMENT.test('pla+')).toBe(true);
			expect(SAFE_SEGMENT.test('high_speed_pla+')).toBe(true);
			expect(SAFE_SEGMENT.test('nylon_pa12+cf15')).toBe(true);
			expect(SAFE_SEGMENT.test('abs+cf')).toBe(true);
		});

		it('should reject segments starting with a plus sign', () => {
			expect(SAFE_SEGMENT.test('+plus')).toBe(false);
		});

		it('should reject segments with spaces', () => {
			expect(SAFE_SEGMENT.test('my brand')).toBe(false);
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

	describe('isUuidSegment', () => {
		// The dataset names entities by UUID; folders are named by slug. A UUID
		// segment means a slug mapping failed and must never become a folder —
		// this is what produced the orphaned `data/1d35f140_..._9c6` (uuid5 of
		// "sunlu") brand directory.
		it('matches the underscore form the dataset uses for folder names', () => {
			expect(isUuidSegment('1d35f140_7cba_5fa4_9bb6_9e3eb2fd95c6')).toBe(true);
			expect(isUuidSegment('3eb316bd_c732_5d47_ba24_3d26f17eb281')).toBe(true);
		});

		it('matches the canonical dash form and is case-insensitive', () => {
			expect(isUuidSegment('1d35f140-7cba-5fa4-9bb6-9e3eb2fd95c6')).toBe(true);
			expect(isUuidSegment('1D35F140-7CBA-5FA4-9BB6-9E3EB2FD95C6')).toBe(true);
		});

		it('does not match normal human-readable slugs', () => {
			expect(isUuidSegment('sunlu')).toBe(false);
			expect(isUuidSegment('bambu_lab')).toBe(false);
			expect(isUuidSegment('grassgreen')).toBe(false);
			expect(isUuidSegment('pla+')).toBe(false);
			expect(isUuidSegment('nylon_pa12+cf15')).toBe(false);
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
			const result = entityPathToFsPath('brands/prusament/materials/PLA/filaments/galaxy_black');
			expect(result).toBe(path.join(DATA_DIR, 'prusament', 'PLA', 'galaxy_black', 'filament.json'));
		});

		it('should map variant paths correctly', () => {
			const result = entityPathToFsPath('brands/prusament/materials/PLA/filaments/galaxy_black/variants/1kg');
			expect(result).toBe(path.join(DATA_DIR, 'prusament', 'PLA', 'galaxy_black', '1kg', 'variant.json'));
		});

		it('should use underscore slugs directly for brands', () => {
			const result = entityPathToFsPath('brands/bambu_lab');
			expect(result).toBe(path.join(DATA_DIR, 'bambu_lab', 'brand.json'));
		});

		it('should use underscore slugs directly for stores', () => {
			const result = entityPathToFsPath('stores/clas_ohlson');
			expect(result).toBe(path.join(STORES_DIR, 'clas_ohlson', 'store.json'));
		});

		it('should uppercase material type segments', () => {
			const result = entityPathToFsPath('brands/prusament/materials/pla');
			expect(result).toBe(path.join(DATA_DIR, 'prusament', 'PLA', 'material.json'));
		});

		it('should leave already-underscored paths unchanged', () => {
			const result = entityPathToFsPath('brands/bambu_lab');
			expect(result).toBe(path.join(DATA_DIR, 'bambu_lab', 'brand.json'));
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

		it('should return null when any segment is a UUID (failed slug mapping)', () => {
			// Regression: a cloud UUID `id` leaked into the brand segment and was
			// written to disk as data/<uuid>/... instead of data/sunlu/...
			expect(
				entityPathToFsPath(
					'brands/1d35f140_7cba_5fa4_9bb6_9e3eb2fd95c6/materials/PLA/filaments/pla+/variants/grassgreen'
				)
			).toBeNull();
			expect(entityPathToFsPath('brands/1d35f140-7cba-5fa4-9bb6-9e3eb2fd95c6')).toBeNull();
			expect(
				entityPathToFsPath(
					'brands/sunlu/materials/PLA/filaments/3eb316bd_c732_5d47_ba24_3d26f17eb281/variants/green'
				)
			).toBeNull();
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

		// A cloud-loaded store carries a UUID `id` and a CDN logo alias in `logo`;
		// the repo-format identifiers live in `slug` and `logo_name`. With those
		// fields present, cleanEntityData must rebuild a schema-valid id + logo and
		// drop the cloud-only fields. (Regression: filterToSchema used to strip
		// slug/logo_name before this ran, leaving the UUID id + bad logo behind.)
		it('rebuilds store id from slug and logo from logo_name (cloud → repo)', () => {
			const data = {
				id: 'f78b7ee7-b60e-573d-a98e-f1531ca751b2',
				slug: '3d_eksperten',
				name: '3D Eksperten',
				storefront_url: 'https://3deksperten.dk/',
				logo: 'a1b2c3.jpg',
				logo_name: 'logo.jpg',
				logo_slug: 'a1b2c3'
			};
			const result = cleanEntityData(data, { schemaType: 'store' });
			expect(result.id).toBe('3d_eksperten');
			expect(result.logo).toBe('logo.jpg');
			expect(result).not.toHaveProperty('slug');
			expect(result).not.toHaveProperty('logo_name');
			expect(result).not.toHaveProperty('logo_slug');
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

	// Every write replaces the whole file, and a payload can legitimately predate
	// UUID assignment (a `create` staged before the entity was published, then
	// submitted again after it merged — see PR #442, which wiped nine uuids that
	// CI had assigned). The canonical identity already committed must survive.
	describe('preserveCanonicalFields', () => {
		const UUID = '6364853f-a44f-41c7-8f8e-9425a18d0659';

		it('carries uuid over onto a payload that has none', () => {
			const result = preserveCanonicalFields(
				{ id: 'pla_metallic', name: 'PLA Metallic' },
				{ uuid: UUID, id: 'pla_metallic', name: 'PLA Metallic' }
			);
			expect(result).toEqual({ uuid: UUID, id: 'pla_metallic', name: 'PLA Metallic' });
		});

		it('leads with the canonical fields, in schema order', () => {
			const result = preserveCanonicalFields(
				{ id: 'pla', name: 'PLA' },
				{ uuid: UUID, moved_from: ['old-uuid'], id: 'pla' }
			);
			expect(Object.keys(result)).toEqual(['uuid', 'moved_from', 'id', 'name']);
		});

		it('keeps the uuid the payload carries (a move re-points identity)', () => {
			const result = preserveCanonicalFields(
				{ uuid: 'incoming-uuid', id: 'pla' },
				{ uuid: UUID, id: 'pla' }
			);
			expect(result.uuid).toBe('incoming-uuid');
		});

		it('treats an empty uuid as unassigned', () => {
			const result = preserveCanonicalFields({ uuid: '', id: 'pla' }, { uuid: UUID, id: 'pla' });
			expect(result.uuid).toBe(UUID);
		});

		it('carries moved_from over independently of uuid', () => {
			const result = preserveCanonicalFields<Record<string, unknown>>(
				{ uuid: UUID, id: 'pla' },
				{ uuid: UUID, moved_from: ['old-uuid'], id: 'pla' }
			);
			expect(result.moved_from).toEqual(['old-uuid']);
		});

		it('returns the payload untouched for a path with nothing committed', () => {
			const incoming = { id: 'pla', name: 'PLA' };
			expect(preserveCanonicalFields(incoming, null)).toBe(incoming);
		});

		it('does not modify the input object', () => {
			const incoming = { id: 'pla' };
			preserveCanonicalFields(incoming, { uuid: UUID, id: 'pla' });
			expect(incoming).toEqual({ id: 'pla' });
		});

		it('pairs spools by (filament_weight, diameter)', () => {
			const result = preserveCanonicalFields<Record<string, unknown>[]>(
				[
					{ filament_weight: 1000, diameter: 1.75, discontinued: false },
					{ filament_weight: 250, diameter: 1.75, discontinued: false }
				],
				[
					// Committed in the opposite order — pairing is by identity, not index.
					{ uuid: 'uuid-250', filament_weight: 250, diameter: 1.75 },
					{ uuid: 'uuid-1000', filament_weight: 1000, diameter: 1.75 }
				]
			);
			expect(result[0].uuid).toBe('uuid-1000');
			expect(result[1].uuid).toBe('uuid-250');
		});

		it('leaves a spool that matches nothing committed unassigned', () => {
			const result = preserveCanonicalFields(
				[{ filament_weight: 5000, diameter: 2.85 }],
				[{ uuid: 'uuid-1000', filament_weight: 1000, diameter: 1.75 }]
			);
			expect(result[0]).not.toHaveProperty('uuid');
		});

		it('never hands the same uuid to two spools sharing an identity', () => {
			const result = preserveCanonicalFields<Record<string, unknown>[]>(
				[
					{ filament_weight: 1000, diameter: 1.75, spool_refill: false },
					{ filament_weight: 1000, diameter: 1.75, spool_refill: true }
				],
				[{ uuid: 'uuid-1000', filament_weight: 1000, diameter: 1.75 }]
			);
			expect(result[0].uuid).toBe('uuid-1000');
			expect(result[1]).not.toHaveProperty('uuid');
		});

		it('ignores a committed file whose shape does not match the payload', () => {
			const incoming = [{ filament_weight: 1000, diameter: 1.75 }];
			expect(preserveCanonicalFields(incoming, { uuid: UUID })).toBe(incoming);
		});
	});
});
