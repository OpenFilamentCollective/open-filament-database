import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '../data');

export const GET: RequestHandler = async ({ params }) => {
	const { brandId, materialType, filamentId } = params;

	try {
		// Path to the filament directory
		const filamentDir = path.join(DATA_DIR, brandId, materialType, filamentId);

		// Read all directories in the filament directory (each represents a variant)
		const entries = await fs.readdir(filamentDir, { withFileTypes: true });

		const variants = await Promise.all(
			entries
				.filter((entry) => entry.isDirectory())
				.map(async (entry) => {
					const variantPath = path.join(filamentDir, entry.name, 'variant.json');
					try {
						const content = await fs.readFile(variantPath, 'utf-8');
						const variant = JSON.parse(content);
						return {
							...variant,
							brandId,
							materialType,
							filamentId,
							variantDir: entry.name
						};
					} catch (error) {
						// Skip directories without variant.json
						return null;
					}
				})
		);

		const validVariants = variants.filter((v) => v !== null);
		return json(validVariants);
	} catch (error) {
		console.error(
			`Error reading variants for ${brandId}/${materialType}/${filamentId}:`,
			error
		);
		return json([], { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { brandId, materialType, filamentId } = params;

	try {
		const variantData = await request.json();

		// TODO: Implement variant creation logic
		// This should:
		// 1. Validate the variant data
		// 2. Generate a new ID if not provided
		// 3. Save to your data storage

		return json({ success: true, variant: variantData }, { status: 201 });
	} catch (error) {
		console.error('Error creating variant:', error);
		return json({ error: 'Failed to create variant' }, { status: 500 });
	}
};
