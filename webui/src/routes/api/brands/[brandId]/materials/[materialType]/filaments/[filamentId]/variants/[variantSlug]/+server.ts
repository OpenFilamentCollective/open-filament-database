import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '../data');

// GET a specific variant
export const GET: RequestHandler = async ({ params }) => {
	const { brandId, materialType, filamentId, variantSlug } = params;

	try {
		const variantPath = path.join(
			DATA_DIR,
			brandId,
			materialType,
			filamentId,
			variantSlug,
			'variant.json'
		);

		const content = await fs.readFile(variantPath, 'utf-8');
		const variant = JSON.parse(content);

		return json(variant);
	} catch (error) {
		console.error(
			`Error reading variant ${brandId}/${materialType}/${filamentId}/${variantSlug}:`,
			error
		);
		return json({ error: 'Variant not found' }, { status: 404 });
	}
};

// UPDATE a specific variant
export const PUT: RequestHandler = async ({ params, request }) => {
	const { brandId, materialType, filamentId, variantSlug } = params;

	try {
		const variantData = await request.json();

		const variantPath = path.join(
			DATA_DIR,
			brandId,
			materialType,
			filamentId,
			variantSlug,
			'variant.json'
		);

		// Check if the environment is local mode (allows writing)
		const { PUBLIC_APP_MODE } = await import('$env/static/public');
		const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

		if (IS_LOCAL) {
			// Write the updated variant data with proper formatting
			const content = JSON.stringify(variantData, null, 4) + '\n';
			await fs.writeFile(variantPath, content, 'utf-8');
			return json({ success: true, variant: variantData });
		} else {
			// In cloud mode, pretend success but don't write
			return json({ success: true, mode: 'cloud', variant: variantData });
		}
	} catch (error) {
		console.error(
			`Error updating variant ${brandId}/${materialType}/${filamentId}/${variantSlug}:`,
			error
		);
		return json({ error: 'Failed to update variant' }, { status: 500 });
	}
};

// DELETE a specific variant
export const DELETE: RequestHandler = async ({ params }) => {
	const { brandId, materialType, filamentId, variantSlug } = params;

	try {
		// TODO: Implement variant deletion logic

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting variant:', error);
		return json({ error: 'Failed to delete variant' }, { status: 500 });
	}
};
