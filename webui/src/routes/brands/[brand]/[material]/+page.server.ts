import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBrand, getMaterial } from '$lib/server/dataIndex';

export const load: PageServerLoad = async ({ params }) => {
	const brandName = decodeURIComponent(params.brand);
	const materialName = decodeURIComponent(params.material);

	const brand = await getBrand(brandName);
	if (!brand) {
		throw error(404, `Brand "${brandName}" not found`);
	}

	const material = await getMaterial(brandName, materialName);
	if (!material) {
		throw error(404, `Material "${materialName}" not found`);
	}

	return {
		brand,
		material
	};
};
