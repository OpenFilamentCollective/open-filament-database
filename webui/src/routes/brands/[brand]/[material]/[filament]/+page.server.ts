import type { PageServerLoad } from './$types';
import { getBrand, getMaterial, getFilament } from '$lib/server/dataIndex';

export const load: PageServerLoad = async ({ params }) => {
	const brandName = decodeURIComponent(params.brand);
	const materialName = decodeURIComponent(params.material);
	const filamentName = decodeURIComponent(params.filament);

	const brand = await getBrand(brandName);
	if (!brand) {
		// Brand not found on server - might be locally created
		return {
			notFound: true,
			notFoundType: 'brand' as const,
			notFoundName: brandName,
			requestedPath: { brandName, materialName, filamentName }
		};
	}

	const material = await getMaterial(brandName, materialName);
	if (!material) {
		// Material not found on server - might be locally created
		return {
			notFound: true,
			notFoundType: 'material' as const,
			notFoundName: materialName,
			brand,
			requestedPath: { brandName, materialName, filamentName }
		};
	}

	const filament = await getFilament(brandName, materialName, filamentName);
	if (!filament) {
		// Filament not found on server - might be locally created
		return {
			notFound: true,
			notFoundType: 'filament' as const,
			notFoundName: filamentName,
			brand,
			material,
			requestedPath: { brandName, materialName, filamentName }
		};
	}

	return {
		notFound: false,
		brand,
		material,
		filament
	};
};
