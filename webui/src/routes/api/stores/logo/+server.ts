import { json } from '@sveltejs/kit';
import { saveLogo, deleteLogo } from '$lib/server/logoHandler';
import { IS_CLOUD } from '$lib/server/cloudProxy';
import type { RequestHandler } from './$types';

/**
 * API endpoint for saving store logos
 * POST /api/stores/logo
 * Body: { storeId: string, imageData: string (data URL) }
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON in request body' }, { status: 400 });
	}
	const { storeId, imageData } = body;

	if (!storeId || !imageData) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	if (IS_CLOUD) {
		return json({ success: true, mode: 'cloud' });
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
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON in request body' }, { status: 400 });
	}
	const { storeId } = body;

	if (!storeId) {
		return json({ error: 'Missing storeId' }, { status: 400 });
	}

	if (IS_CLOUD) {
		return json({ success: true, mode: 'cloud' });
	}

	const result = await deleteLogo(storeId, 'store');

	if (!result.success) {
		return json({ error: result.error }, { status: 500 });
	}

	return json({ success: true });
};
