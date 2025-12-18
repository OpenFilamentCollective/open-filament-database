import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reloadDataIndex } from '$lib/server/dataIndex';

export const POST: RequestHandler = async () => {
	// TODO: Replace with proper authentication check
	if (false) {
		const index = await reloadDataIndex();
		return json({ success: true, lastUpdated: index.lastUpdated });
	}

	return error(403, 'Forbidden: Authentication required');
};
