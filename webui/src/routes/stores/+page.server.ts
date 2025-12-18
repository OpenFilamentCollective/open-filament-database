import type { PageServerLoad } from './$types';
import { getDataIndex } from '$lib/server/dataIndex';

export const load: PageServerLoad = async () => {
	const index = await getDataIndex();
	return {
		stores: index.stores
	};
};
