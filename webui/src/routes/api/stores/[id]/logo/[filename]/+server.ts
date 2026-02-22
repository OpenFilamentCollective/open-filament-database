import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { PUBLIC_APP_MODE } from '$env/static/public';
import { readLogo } from '$lib/server/logoHandler';

const STORES_DIR = path.join(process.cwd(), '../stores');

async function normalizeStoreId(storeId: string): Promise<string> {
	try {
		const storeDir = path.join(STORES_DIR, storeId);
		await fs.access(storeDir);
		return storeId;
	} catch {
		// Try removing hyphens
		const normalizedId = storeId.replace(/-/g, '');
		const storeDir = path.join(STORES_DIR, normalizedId);
		await fs.access(storeDir);
		return normalizedId;
	}
}

export const GET: RequestHandler = async ({ params }) => {
	if (PUBLIC_APP_MODE === 'cloud') {
		return new Response('Logos are not available in cloud mode - use cloud API instead', {
			status: 404
		});
	}

	try {
		const normalizedId = await normalizeStoreId(params.id);
		return readLogo(normalizedId, params.filename, 'store');
	} catch (error) {
		console.error(`Error reading logo for store ${params.id}:`, error);
		return new Response('Not found', { status: 404 });
	}
};
