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

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const { PUBLIC_APP_MODE } = await import('$env/static/public');
		const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

		const filamentData = await request.json();

		// Generate filament slug/id from name if not provided
		const filamentId = filamentData.slug || filamentData.id ||
			filamentData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

		if (IS_LOCAL) {
			const normalizedBrandId = await normalizeBrandId(DATA_DIR, params.brandId);
			const filamentDir = path.join(DATA_DIR, normalizedBrandId, params.materialType, filamentId);

			// Create the filament directory
			await fs.mkdir(filamentDir, { recursive: true });

			// Write the filament.json file (without internal tracking fields)
			const { brandId, materialType, filamentDir: fd, ...cleanData } = filamentData;
			// Ensure id and slug are set
			cleanData.id = filamentId;
			cleanData.slug = filamentId;
			const content = JSON.stringify(cleanData, null, 4) + '\n';
			await fs.writeFile(path.join(filamentDir, 'filament.json'), content, 'utf-8');

			return json({
				success: true,
				filament: { ...cleanData, brandId: params.brandId, materialType: params.materialType }
			}, { status: 201 });
		} else {
			// In cloud mode, pretend success but don't write
			return json({
				success: true,
				mode: 'cloud',
				filament: { ...filamentData, id: filamentId, slug: filamentId }
			}, { status: 201 });
		}
	} catch (error) {
		console.error(`Error creating filament for ${params.brandId}/${params.materialType}:`, error);
		return json({ error: 'Failed to create filament' }, { status: 500 });
	}
};
