import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { readLogo } from '$lib/server/logoHandler';
import { proxyLogoToCloud } from '$lib/server/cloudProxy';
import { STORES_DIR, normalizeStoreId } from '$lib/server/entityConfig';

export const GET: RequestHandler = async ({ params }) => {
	if (env.PUBLIC_APP_MODE === 'cloud') {
		return proxyLogoToCloud('store', params.filename);
	}

	try {
		const normalizedId = await normalizeStoreId(STORES_DIR, params.id);
		return readLogo(normalizedId, params.filename, 'store');
	} catch (error) {
		console.error(`Error reading logo for store ${params.id}:`, error);
		return new Response('Not found', { status: 404 });
	}
};
