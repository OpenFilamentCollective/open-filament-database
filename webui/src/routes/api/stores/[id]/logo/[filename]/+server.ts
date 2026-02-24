import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from '$env/dynamic/public';
import { readLogo } from '$lib/server/logoHandler';
import { proxyLogoToCloud } from '$lib/server/cloudProxy';
import { validatePathSegment } from '$lib/server/pathValidation';

const STORES_DIR = path.join(process.cwd(), '../stores');

async function normalizeStoreId(storeId: string): Promise<string> {
	const safeId = validatePathSegment(storeId, 'storeId');
	try {
		const storeDir = path.join(STORES_DIR, safeId);
		await fs.access(storeDir);
		return safeId;
	} catch {
		// Try removing hyphens
		const normalizedId = safeId.replace(/-/g, '');
		const storeDir = path.join(STORES_DIR, normalizedId);
		await fs.access(storeDir);
		return normalizedId;
	}
}

export const GET: RequestHandler = async ({ params }) => {
	if (env.PUBLIC_APP_MODE === 'cloud') {
		return proxyLogoToCloud('store', params.id, params.filename);
	}

	try {
		const normalizedId = await normalizeStoreId(params.id);
		return readLogo(normalizedId, params.filename, 'store');
	} catch (error) {
		console.error(`Error reading logo for store ${params.id}:`, error);
		return new Response('Not found', { status: 404 });
	}
};
