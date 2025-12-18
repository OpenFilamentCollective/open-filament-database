import type { PageServerLoad } from './$types';
import { getDataIndex } from '$lib/server/dataIndex';

export const load: PageServerLoad = async () => {
	const index = await getDataIndex();

	return {
		brands: index.brands,
		totalBrands: index.brands.length,
		totalMaterials: index.brands.reduce((sum, b) => sum + b.materials.length, 0),
		totalFilaments: index.brands.reduce(
			(sum, b) => sum + b.materials.reduce((s, m) => s + m.filaments.length, 0),
			0
		),
		totalVariants: index.brands.reduce(
			(sum, b) =>
				sum +
				b.materials.reduce((s, m) => s + m.filaments.reduce((ss, f) => ss + f.variants.length, 0), 0),
			0
		)
	};
};
