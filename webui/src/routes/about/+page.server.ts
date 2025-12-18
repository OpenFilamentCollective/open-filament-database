import type { PageServerLoad } from './$types';
import { getDataIndex } from '$lib/server/dataIndex';

export const load: PageServerLoad = async () => {
	const index = await getDataIndex();

	const totalMaterials = index.brands.reduce((sum, b) => sum + b.materials.length, 0);
	const totalFilaments = index.brands.reduce(
		(sum, b) => sum + b.materials.reduce((s, m) => s + m.filaments.length, 0),
		0
	);
	const totalVariants = index.brands.reduce(
		(sum, b) =>
			sum +
			b.materials.reduce((s, m) => s + m.filaments.reduce((ss, f) => ss + f.variants.length, 0), 0),
		0
	);

	return {
		stats: {
			brands: index.brands.length,
			materials: totalMaterials,
			filaments: totalFilaments,
			variants: totalVariants,
			stores: index.stores.length
		}
	};
};
