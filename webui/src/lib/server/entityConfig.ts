import { promises as fs } from 'fs';
import path from 'path';

export interface EntityConfig {
	/** Entity type name */
	entityType: string;

	/** The JSON filename inside the entity directory (e.g., 'brand.json') */
	jsonFilename: string;

	/** Base directory containing entity directories */
	baseDir: string;

	/**
	 * Route parameter names for parent path segments, in order.
	 * Empty for root entities (brand, store).
	 */
	parentParams: string[];

	/** The route parameter name for this entity's own ID (null for collection-only routes) */
	idParam: string | null;

	/** Fields to strip from request body before writing to disk */
	stripFields: string[];

	/**
	 * Fields to augment onto the response when reading.
	 * Maps field name → 'dirName' (use directory name) or a param name.
	 */
	augmentFields: Record<string, 'dirName' | string>;

	/**
	 * How to generate a slug from request body for POST.
	 * 'lowercase' | 'uppercase' | null (no POST support)
	 */
	slugTransform: 'lowercase' | 'uppercase' | null;

	/** Field in request body to use as slug source (defaults to 'name') */
	slugSourceField: string;

	/** Field that overrides slug generation if present in request body */
	slugOverrideField?: string;

	/** Whether to write id/slug fields into the stored JSON on create (default: true) */
	writeSlugToFile?: boolean;

	/** Additional fields to set on stored data during create. Maps field → param name. */
	createExtraFields: Record<string, string>;

	/** Default values for missing fields when reading */
	readDefaults: Record<string, unknown>;

	/** Optional ID normalization (tries filesystem access) */
	normalizeId?: (baseDir: string, rawId: string) => Promise<string>;

	/** Optional validation for PUT requests */
	validatePut?: (params: Record<string, string>, data: Record<string, unknown>) => { error: string; status: number } | null;

	/**
	 * Extra JSON files to merge into the entity data when reading.
	 * Maps a field name to the filename (e.g., { sizes: 'sizes.json' }).
	 */
	supplementaryFiles?: Record<string, string>;
}

// === Shared constants ===

export const DATA_DIR = path.join(process.cwd(), '../data');
export const STORES_DIR = path.join(process.cwd(), '../stores');
export const SCHEMA_DIR = path.join(process.cwd(), '../schemas');

// === ID normalizers ===

export async function normalizeBrandId(baseDir: string, brandId: string): Promise<string> {
	try {
		await fs.access(path.join(baseDir, brandId));
		return brandId;
	} catch {
		const normalized = brandId.replace(/-/g, '_');
		await fs.access(path.join(baseDir, normalized));
		return normalized;
	}
}

export async function normalizeMaterialType(parentDir: string, materialType: string): Promise<string> {
	try {
		await fs.access(path.join(parentDir, materialType));
		return materialType;
	} catch {
		// Material directories are typically uppercase (ABS, PLA, PETG)
		const upper = materialType.toUpperCase();
		await fs.access(path.join(parentDir, upper));
		return upper;
	}
}

async function normalizeStoreId(baseDir: string, storeId: string): Promise<string> {
	try {
		await fs.access(path.join(baseDir, storeId));
		return storeId;
	} catch {
		const normalized = storeId.replace(/-/g, '');
		await fs.access(path.join(baseDir, normalized));
		return normalized;
	}
}

// === Entity configurations ===

export const ENTITY_CONFIGS: Record<string, EntityConfig> = {
	brand: {
		entityType: 'brand',
		jsonFilename: 'brand.json',
		baseDir: DATA_DIR,
		parentParams: [],
		idParam: 'id',
		stripFields: [],
		augmentFields: {},
		slugTransform: null,
		slugSourceField: 'name',
		createExtraFields: {},
		readDefaults: {},
		normalizeId: normalizeBrandId
	},

	store: {
		entityType: 'store',
		jsonFilename: 'store.json',
		baseDir: STORES_DIR,
		parentParams: [],
		idParam: 'id',
		stripFields: [],
		augmentFields: {},
		slugTransform: null,
		slugSourceField: 'name',
		createExtraFields: {},
		readDefaults: {},
		normalizeId: normalizeStoreId,
		validatePut: (params, data) => {
			if (data.id !== params.id) {
				return { error: 'Store ID mismatch', status: 400 };
			}
			return null;
		}
	},

	material: {
		entityType: 'material',
		jsonFilename: 'material.json',
		baseDir: DATA_DIR,
		parentParams: ['brandId'],
		idParam: 'materialType',
		stripFields: ['id', 'brandId', 'materialType'],
		augmentFields: { id: 'dirName', brandId: 'brandId', materialType: 'dirName' },
		slugTransform: 'uppercase',
		slugSourceField: 'material',
		slugOverrideField: 'materialType',
		writeSlugToFile: false,
		createExtraFields: {},
		readDefaults: {},
		normalizeId: normalizeMaterialType
	},

	filament: {
		entityType: 'filament',
		jsonFilename: 'filament.json',
		baseDir: DATA_DIR,
		parentParams: ['brandId', 'materialType'],
		idParam: 'filamentId',
		stripFields: ['brandId', 'materialType', 'filamentDir'],
		augmentFields: { slug: 'dirName', brandId: 'brandId', materialType: 'materialType' },
		slugTransform: 'lowercase',
		slugSourceField: 'name',
		createExtraFields: {},
		readDefaults: {}
	},

	variant: {
		entityType: 'variant',
		jsonFilename: 'variant.json',
		baseDir: DATA_DIR,
		parentParams: ['brandId', 'materialType', 'filamentId'],
		idParam: 'variantSlug',
		stripFields: ['brandId', 'materialType', 'filamentId', 'variantDir'],
		augmentFields: { slug: 'dirName', brandId: 'brandId', materialType: 'materialType', filamentId: 'filamentId' },
		slugTransform: 'lowercase',
		slugSourceField: 'name',
		createExtraFields: { filament_id: 'filamentId' },
		readDefaults: { discontinued: false },
		supplementaryFiles: { sizes: 'sizes.json' }
	}
};
