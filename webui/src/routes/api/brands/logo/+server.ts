import { json } from '@sveltejs/kit';
import { saveLogo, deleteLogo } from '$lib/server/logoHandler';
import { IS_CLOUD } from '$lib/server/cloudProxy';
import type { RequestHandler } from './$types';

/**
 * API endpoint for saving brand logos
 * POST /api/brands/logo
 * Body: { brandId: string, imageData: string (data URL) }
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON in request body' }, { status: 400 });
	}
	const { brandId, imageData } = body;

	if (!brandId || !imageData) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	if (IS_CLOUD) {
		return json({ success: true, mode: 'cloud' });
	}

	const result = await saveLogo(brandId, imageData, 'brand');

	if (!result.success) {
		return json({ error: result.error }, { status: 500 });
	}

	return json({ success: true, path: result.path });
};

/**
 * API endpoint for deleting brand logos
 * DELETE /api/brands/logo
 * Body: { brandId: string }
 */
export const DELETE: RequestHandler = async ({ request }) => {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON in request body' }, { status: 400 });
	}
	const { brandId } = body;

	if (!brandId) {
		return json({ error: 'Missing brandId' }, { status: 400 });
	}

	if (IS_CLOUD) {
		return json({ success: true, mode: 'cloud' });
	}

	const result = await deleteLogo(brandId, 'brand');

	if (!result.success) {
		return json({ error: result.error }, { status: 500 });
	}

	return json({ success: true });
};
