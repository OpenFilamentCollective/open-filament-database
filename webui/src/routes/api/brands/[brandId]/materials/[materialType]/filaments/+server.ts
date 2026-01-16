import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { normalizeBrandId } from '../../../../utils';

const DATA_DIR = path.join(process.cwd(), '../data');

export const GET: RequestHandler = async ({ params }) => {
	try {
		const normalizedBrandId = await normalizeBrandId(DATA_DIR, params.brandId);
		const materialsDir = path.join(DATA_DIR, normalizedBrandId, params.materialType);
		const entries = await fs.readdir(materialsDir, { withFileTypes: true });

		const filaments = await Promise.all(
			entries
				.filter((entry) => entry.isDirectory())
				.map(async (entry) => {
					const filamentPath = path.join(materialsDir, entry.name, 'filament.json');
					try {
						const content = await fs.readFile(filamentPath, 'utf-8');
						const filament = JSON.parse(content);
						return {
							...filament,
							brandId: params.brandId,
							materialType: params.materialType,
							filamentDir: entry.name
						};
					} catch (error) {
						return null;
					}
				})
		);

		const validFilaments = filaments.filter((f) => f !== null);
		return json(validFilaments);
	} catch (error) {
		console.error(
			`Error reading filaments for ${params.brandId}/${params.materialType}:`,
			error
		);
		return json([], { status: 500 });
	}
};
