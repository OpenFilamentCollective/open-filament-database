import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '../data');

export const GET: RequestHandler = async ({ params }) => {
	try {
		const brandDir = path.join(DATA_DIR, params.brandId);
		const entries = await fs.readdir(brandDir, { withFileTypes: true });

		const materials = await Promise.all(
			entries
				.filter((entry) => entry.isDirectory())
				.map(async (entry) => {
					const materialPath = path.join(brandDir, entry.name, 'material.json');
					try {
						const content = await fs.readFile(materialPath, 'utf-8');
						const material = JSON.parse(content);
						return {
							...material,
							brandId: params.brandId,
							materialType: entry.name
						};
					} catch (error) {
						return null;
					}
				})
		);

		const validMaterials = materials.filter((m) => m !== null);
		return json(validMaterials);
	} catch (error) {
		console.error(`Error reading materials for brand ${params.brandId}:`, error);
		return json([], { status: 500 });
	}
};
