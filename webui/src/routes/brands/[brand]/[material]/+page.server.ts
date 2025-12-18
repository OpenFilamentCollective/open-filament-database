import type { PageServerLoad } from './$types';
import { getBrand, getMaterial } from '$lib/server/dataIndex';

export const load: PageServerLoad = async ({ params }) => {
	const brandName = decodeURIComponent(params.brand);
	const materialName = decodeURIComponent(params.material);

	const brand = await getBrand(brandName);
	if (!brand) {
		// Brand not found on server - might be locally created
		return {
			notFound: true,
			notFoundType: 'brand' as const,
			notFoundName: brandName,
			requestedPath: { brandName, materialName }
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
			requestedPath: { brandName, materialName }
		};
	}

	return {
		notFound: false,
		brand,
		material
	};
};
