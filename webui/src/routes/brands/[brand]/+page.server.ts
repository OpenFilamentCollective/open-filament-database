import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBrand } from '$lib/server/dataIndex';

export const load: PageServerLoad = async ({ params }) => {
	const brandName = decodeURIComponent(params.brand);
	const brand = await getBrand(brandName);

	if (!brand) {
		throw error(404, `Brand "${brandName}" not found`);
	}

	return {
		brand
	};
};
