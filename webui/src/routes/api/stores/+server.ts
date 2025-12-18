import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDataIndex } from '$lib/server/dataIndex';

export const GET: RequestHandler = async () => {
	const index = await getDataIndex();
	return json(index.stores);
};
