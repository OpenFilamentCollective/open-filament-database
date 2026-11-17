import type { RequestHandler } from './$types';
import path from 'path';
import { env } from '$env/dynamic/public';
import { normalizeBrandId } from '$lib/server/entityConfig';
import { readLogo } from '$lib/server/logoHandler';
import { proxyLogoToCloud } from '$lib/server/cloudProxy';

const DATA_DIR = path.join(process.cwd(), '../data');

export const GET: RequestHandler = async ({ params }) => {
	if (env.PUBLIC_APP_MODE === 'cloud') {
		return proxyLogoToCloud('brand', params.filename);
	}

	try {
		const normalizedId = await normalizeBrandId(DATA_DIR, params.id);
		return readLogo(normalizedId, params.filename, 'brand');
	} catch (error) {
		console.error(`Error reading logo for brand ${params.id}:`, error);
		return new Response('Not found', { status: 404 });
	}
};
