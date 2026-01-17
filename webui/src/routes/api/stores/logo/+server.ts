import { json } from '@sveltejs/kit';
import { saveLogo, deleteLogo } from '$lib/server/logoHandler';
import type { RequestHandler } from './$types';

/**
 * API endpoint for saving store logos
 * POST /api/stores/logo
 * Body: { storeId: string, imageData: string (data URL) }
 */
export const POST: RequestHandler = async ({ request }) => {
	const { storeId, imageData } = await request.json();

	if (!storeId || !imageData) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	const result = await saveLogo(storeId, imageData, 'store');

	if (!result.success) {
		return json({ error: result.error }, { status: 500 });
	}

	return json({ success: true, path: result.path });
};

/**
 * API endpoint for deleting store logos
 * DELETE /api/stores/logo
 * Body: { storeId: string }
 */
export const DELETE: RequestHandler = async ({ request }) => {
	const { storeId } = await request.json();

	if (!storeId) {
		return json({ error: 'Missing storeId' }, { status: 400 });
	}

	const result = await deleteLogo(storeId, 'store');

	if (!result.success) {
		return json({ error: result.error }, { status: 500 });
	}

	return json({ success: true });
};
