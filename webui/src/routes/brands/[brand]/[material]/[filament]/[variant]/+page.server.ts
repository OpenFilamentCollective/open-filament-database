import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBrand, getMaterial, getFilament, getVariant, getDataIndex } from '$lib/server/dataIndex';

export const load: PageServerLoad = async ({ params }) => {
	const brandName = decodeURIComponent(params.brand);
	const materialName = decodeURIComponent(params.material);
	const filamentName = decodeURIComponent(params.filament);
	const variantName = decodeURIComponent(params.variant);

	const brand = await getBrand(brandName);
	if (!brand) {
		throw error(404, `Brand "${brandName}" not found`);
	}

	const material = await getMaterial(brandName, materialName);
	if (!material) {
		throw error(404, `Material "${materialName}" not found`);
	}

	const filament = await getFilament(brandName, materialName, filamentName);
	if (!filament) {
		throw error(404, `Filament "${filamentName}" not found`);
	}

	const variant = await getVariant(brandName, materialName, filamentName, variantName);
	if (!variant) {
		throw error(404, `Variant "${variantName}" not found`);
	}

	// Get stores for purchase links lookup
	const index = await getDataIndex();

	return {
		brand,
		material,
		filament,
		variant,
		stores: index.stores
	};
};
