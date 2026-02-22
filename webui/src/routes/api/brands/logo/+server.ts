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
	const { brandId, imageData } = await request.json();

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
	const { brandId } = await request.json();

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
