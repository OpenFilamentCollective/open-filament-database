import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBrand, getMaterial, getFilament, getVariant, getDataIndex } from '$lib/server/dataIndex';

export const load: PageServerLoad = async ({ params }) => {
	const brandName = decodeURIComponent(params.brand);
	const materialName = decodeURIComponent(params.material);
	const filamentName = decodeURIComponent(params.filament);
	const variantName = decodeURIComponent(params.variant);

	// Get stores for purchase links lookup (always needed)
	const index = await getDataIndex();

	const brand = await getBrand(brandName);
	if (!brand) {
		// Brand not found - could be a renamed brand, let client handle
		return {
			notFound: true as const,
			notFoundType: 'brand' as const,
			notFoundName: brandName,
			requestedPath: { brandName, materialName, filamentName, variantName },
			stores: index.stores
		};
	}

	const material = await getMaterial(brandName, materialName);
	if (!material) {
		// Material not found - could be renamed, let client handle
		return {
			notFound: true as const,
			notFoundType: 'material' as const,
			notFoundName: materialName,
			requestedPath: { brandName, materialName, filamentName, variantName },
			brand,
			stores: index.stores
		};
	}

	const filament = await getFilament(brandName, materialName, filamentName);
	if (!filament) {
		// Filament not found - could be renamed, let client handle
		return {
			notFound: true as const,
			notFoundType: 'filament' as const,
			notFoundName: filamentName,
			requestedPath: { brandName, materialName, filamentName, variantName },
			brand,
			material,
			stores: index.stores
		};
	}

	const variant = await getVariant(brandName, materialName, filamentName, variantName);
	if (!variant) {
		// Variant not found - could be renamed, let client handle
		return {
			notFound: true as const,
			notFoundType: 'variant' as const,
			notFoundName: variantName,
			requestedPath: { brandName, materialName, filamentName, variantName },
			brand,
			material,
			filament,
			stores: index.stores
		};
	}

	return {
		notFound: false as const,
		brand,
		material,
		filament,
		variant,
		stores: index.stores
	};
};
