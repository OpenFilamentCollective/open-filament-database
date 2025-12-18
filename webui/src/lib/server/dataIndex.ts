import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import {
	BrandSchema,
	MaterialSchema,
	FilamentSchema,
	VariantSchema,
	FilamentSizeArraySchema,
	StoreSchema,
	type Brand,
	type Material,
	type Filament,
	type Variant,
	type FilamentSize,
	type Store
} from '$lib/schemas/generated';

// Path to data and stores directories (relative to project root)
const DATA_DIR = resolve(process.cwd(), '..', 'data');
const STORES_DIR = resolve(process.cwd(), '..', 'stores');

// Index types
export interface VariantIndex {
	name: string;
	path: string;
	data: Variant;
	sizes: FilamentSize[];
}

export interface FilamentIndex {
	name: string;
	path: string;
	data: Filament;
	variants: VariantIndex[];
}

export interface MaterialIndex {
	name: string;
	path: string;
	data: Material;
	filaments: FilamentIndex[];
}

export interface BrandIndex {
	name: string;
	path: string;
	data: Brand;
	logoPath: string | null;
	materials: MaterialIndex[];
}

export interface StoreIndex {
	id: string;
	path: string;
	data: Store;
}

export interface DataIndex {
	brands: BrandIndex[];
	stores: StoreIndex[];
	lastUpdated: number;
}

// Cached index
let cachedIndex: DataIndex | null = null;

async function isDirectory(path: string): Promise<boolean> {
	try {
		const stats = await stat(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function readJsonFile<T>(path: string, schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown } }): Promise<T | null> {
	try {
		const content = await readFile(path, 'utf-8');
		const json = JSON.parse(content);
		const result = schema.safeParse(json);
		if (result.success) {
			return result.data as T;
		}
		console.warn(`Validation failed for ${path}:`, result.error);
		return null;
	} catch (error) {
		console.warn(`Failed to read ${path}:`, error);
		return null;
	}
}

async function findLogoFile(brandPath: string): Promise<string | null> {
	try {
		const entries = await readdir(brandPath);
		const logoFile = entries.find(
			(f: string) => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.svg')
		);
		return logoFile || null;
	} catch {
		return null;
	}
}

async function indexVariant(variantPath: string, variantName: string): Promise<VariantIndex | null> {
	const variantJsonPath = join(variantPath, 'variant.json');
	const sizesJsonPath = join(variantPath, 'sizes.json');

	const variantData = await readJsonFile<Variant>(variantJsonPath, VariantSchema);
	if (!variantData) return null;

	let sizes: FilamentSize[] = [];
	if (await fileExists(sizesJsonPath)) {
		const sizesData = await readJsonFile<FilamentSize[]>(sizesJsonPath, FilamentSizeArraySchema);
		if (sizesData) {
			sizes = sizesData;
		}
	}

	return {
		name: variantName,
		path: variantPath.replace(DATA_DIR, ''),
		data: variantData,
		sizes
	};
}

async function indexFilament(filamentPath: string, filamentName: string): Promise<FilamentIndex | null> {
	const filamentJsonPath = join(filamentPath, 'filament.json');
	const filamentData = await readJsonFile<Filament>(filamentJsonPath, FilamentSchema);
	if (!filamentData) return null;

	const variants: VariantIndex[] = [];
	const entries = await readdir(filamentPath);

	for (const entry of entries) {
		const entryPath = join(filamentPath, entry);
		if (await isDirectory(entryPath)) {
			const variant = await indexVariant(entryPath, entry);
			if (variant) {
				variants.push(variant);
			}
		}
	}

	return {
		name: filamentName,
		path: filamentPath.replace(DATA_DIR, ''),
		data: filamentData,
		variants: variants.sort((a, b) => a.name.localeCompare(b.name))
	};
}

async function indexMaterial(materialPath: string, materialName: string): Promise<MaterialIndex | null> {
	const materialJsonPath = join(materialPath, 'material.json');
	const materialData = await readJsonFile<Material>(materialJsonPath, MaterialSchema);
	if (!materialData) return null;

	const filaments: FilamentIndex[] = [];
	const entries = await readdir(materialPath);

	for (const entry of entries) {
		const entryPath = join(materialPath, entry);
		if (await isDirectory(entryPath)) {
			const filament = await indexFilament(entryPath, entry);
			if (filament) {
				filaments.push(filament);
			}
		}
	}

	return {
		name: materialName,
		path: materialPath.replace(DATA_DIR, ''),
		data: materialData,
		filaments: filaments.sort((a, b) => a.name.localeCompare(b.name))
	};
}

async function indexBrand(brandPath: string, brandName: string): Promise<BrandIndex | null> {
	const brandJsonPath = join(brandPath, 'brand.json');
	const brandData = await readJsonFile<Brand>(brandJsonPath, BrandSchema);
	if (!brandData) return null;

	const logoFile = await findLogoFile(brandPath);

	const materials: MaterialIndex[] = [];
	const entries = await readdir(brandPath);

	for (const entry of entries) {
		const entryPath = join(brandPath, entry);
		if (await isDirectory(entryPath)) {
			const material = await indexMaterial(entryPath, entry);
			if (material) {
				materials.push(material);
			}
		}
	}

	return {
		name: brandName,
		path: brandPath.replace(DATA_DIR, ''),
		data: brandData,
		logoPath: logoFile ? `/${brandName}/${logoFile}` : null,
		materials: materials.sort((a, b) => a.name.localeCompare(b.name))
	};
}

async function indexStore(storePath: string, storeId: string): Promise<StoreIndex | null> {
	const storeJsonPath = join(storePath, 'store.json');
	const storeData = await readJsonFile<Store>(storeJsonPath, StoreSchema);
	if (!storeData) return null;

	return {
		id: storeId,
		path: storePath.replace(STORES_DIR, ''),
		data: storeData
	};
}

async function buildIndex(): Promise<DataIndex> {
	const brands: BrandIndex[] = [];
	const stores: StoreIndex[] = [];

	// Index brands
	try {
		const brandEntries = await readdir(DATA_DIR);
		for (const entry of brandEntries) {
			const entryPath = join(DATA_DIR, entry);
			if (await isDirectory(entryPath)) {
				const brand = await indexBrand(entryPath, entry);
				if (brand) {
					brands.push(brand);
				}
			}
		}
	} catch (error) {
		console.error('Failed to index brands:', error);
	}

	// Index stores
	try {
		const storeEntries = await readdir(STORES_DIR);
		for (const entry of storeEntries) {
			const entryPath = join(STORES_DIR, entry);
			if (await isDirectory(entryPath)) {
				const store = await indexStore(entryPath, entry);
				if (store) {
					stores.push(store);
				}
			}
		}
	} catch (error) {
		console.error('Failed to index stores:', error);
	}

	return {
		brands: brands.sort((a, b) => a.name.localeCompare(b.name)),
		stores: stores.sort((a, b) => a.data.name.localeCompare(b.data.name)),
		lastUpdated: Date.now()
	};
}

export async function getDataIndex(): Promise<DataIndex> {
	if (!cachedIndex) {
		cachedIndex = await buildIndex();
		console.log(`Data index built: ${cachedIndex.brands.length} brands, ${cachedIndex.stores.length} stores`);
	}
	return cachedIndex;
}

export async function reloadDataIndex(): Promise<DataIndex> {
	cachedIndex = await buildIndex();
	console.log(`Data index reloaded: ${cachedIndex.brands.length} brands, ${cachedIndex.stores.length} stores`);
	return cachedIndex;
}

// Helper functions to get specific data
export async function getBrand(brandName: string): Promise<BrandIndex | null> {
	const index = await getDataIndex();
	return index.brands.find((b) => b.name === brandName) || null;
}

export async function getMaterial(brandName: string, materialName: string): Promise<MaterialIndex | null> {
	const brand = await getBrand(brandName);
	if (!brand) return null;
	return brand.materials.find((m) => m.name === materialName) || null;
}

export async function getFilament(
	brandName: string,
	materialName: string,
	filamentName: string
): Promise<FilamentIndex | null> {
	const material = await getMaterial(brandName, materialName);
	if (!material) return null;
	return material.filaments.find((f) => f.name === filamentName) || null;
}

export async function getVariant(
	brandName: string,
	materialName: string,
	filamentName: string,
	variantName: string
): Promise<VariantIndex | null> {
	const filament = await getFilament(brandName, materialName, filamentName);
	if (!filament) return null;
	return filament.variants.find((v) => v.name === variantName) || null;
}

export async function getStore(storeId: string): Promise<StoreIndex | null> {
	const index = await getDataIndex();
	return index.stores.find((s) => s.id === storeId) || null;
}

export function getDataDir(): string {
	return DATA_DIR;
}

export function getStoresDir(): string {
	return STORES_DIR;
}
