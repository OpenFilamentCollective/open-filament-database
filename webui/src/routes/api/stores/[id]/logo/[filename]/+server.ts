import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { PUBLIC_APP_MODE } from '$env/static/public';

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
	// In cloud mode, logos should be fetched from the cloud API, not local filesystem
	if (PUBLIC_APP_MODE === 'cloud') {
		return new Response('Logos are not available in cloud mode - use cloud API instead', {
			status: 404
		});
	}

	try {
		const normalizedId = await normalizeStoreId(params.id);
		const logoPath = path.join(STORES_DIR, normalizedId, params.filename);
		const fileBuffer = await fs.readFile(logoPath);

		const ext = path.extname(params.filename).toLowerCase();
		const contentTypeMap: Record<string, string> = {
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.svg': 'image/svg+xml'
		};

		const contentType = contentTypeMap[ext] || 'application/octet-stream';

		return new Response(fileBuffer, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=31536000'
			}
		});
	} catch (error) {
		console.error(`Error reading logo for store ${params.id}:`, error);
		return new Response('Not found', { status: 404 });
	}
};
