import type { PageServerLoad } from './$types';
import { getBrand } from '$lib/server/dataIndex';

export const load: PageServerLoad = async ({ params }) => {
	const brandName = decodeURIComponent(params.brand);
	const brand = await getBrand(brandName);

	// Return brand or null - let the page handle missing brands
	// (they might exist as local-only pending changes)
	return {
		brand,
		brandName
	};
};
