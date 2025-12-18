import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBrand, getMaterial, getFilament, getVariant, getDataIndex } from '$lib/server/dataIndex';

/**
 * API endpoint to fetch data by path
 * Used by client-side code to load original data when navigating to renamed paths
 *
 * Examples:
 * - /api/v1/path/BrandName -> brand data
 * - /api/v1/path/BrandName/MaterialName -> material data
 * - /api/v1/path/BrandName/MaterialName/FilamentName -> filament data
 * - /api/v1/path/BrandName/MaterialName/FilamentName/VariantName -> variant data
 */
export const GET: RequestHandler = async ({ params }) => {
	const pathParts = params.path?.split('/').map(p => decodeURIComponent(p)) ?? [];

	if (pathParts.length === 0) {
		throw error(400, 'Path is required');
	}

	const brandName = pathParts[0];
	const materialName = pathParts[1];
	const filamentName = pathParts[2];
	const variantName = pathParts[3];

	// Always try to load brand
	const brand = await getBrand(brandName);
	if (!brand) {
		throw error(404, `Brand "${brandName}" not found`);
	}

	// Just brand requested
	if (pathParts.length === 1) {
		return json({ type: 'brand', brand });
	}

	// Material level
	const material = await getMaterial(brandName, materialName);
	if (!material) {
		throw error(404, `Material "${materialName}" not found`);
	}

	if (pathParts.length === 2) {
		return json({ type: 'material', brand, material });
	}

	// Filament level
	const filament = await getFilament(brandName, materialName, filamentName);
	if (!filament) {
		throw error(404, `Filament "${filamentName}" not found`);
	}

	if (pathParts.length === 3) {
		return json({ type: 'filament', brand, material, filament });
	}

	// Variant level
	const variant = await getVariant(brandName, materialName, filamentName, variantName);
	if (!variant) {
		throw error(404, `Variant "${variantName}" not found`);
	}

	// Get stores for purchase links
	const index = await getDataIndex();

	return json({
		type: 'variant',
		brand,
		material,
		filament,
		variant,
		stores: index.stores
	});
};
