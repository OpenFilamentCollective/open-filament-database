import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { normalizeBrandId } from '../../utils';

const DATA_DIR = path.join(process.cwd(), '../data');

export const GET: RequestHandler = async ({ params }) => {
	try {
		const normalizedBrandId = await normalizeBrandId(DATA_DIR, params.brandId);
		const brandDir = path.join(DATA_DIR, normalizedBrandId);
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
							id: entry.name, // Use directory name as id for change tracking
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

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const { PUBLIC_APP_MODE } = await import('$env/static/public');
		const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

		const materialData = await request.json();

		// Generate materialType from the material name (lowercase, hyphenated)
		const materialType = materialData.materialType ||
			materialData.material.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

		if (IS_LOCAL) {
			const normalizedBrandId = await normalizeBrandId(DATA_DIR, params.brandId);
			const materialDir = path.join(DATA_DIR, normalizedBrandId, materialType);

			// Create the material directory
			await fs.mkdir(materialDir, { recursive: true });

			// Write the material.json file (without internal tracking fields)
			const { id, brandId, materialType: mt, ...cleanData } = materialData;
			const content = JSON.stringify(cleanData, null, 4) + '\n';
			await fs.writeFile(path.join(materialDir, 'material.json'), content, 'utf-8');

			return json({
				success: true,
				material: { ...materialData, id: materialType, materialType }
			}, { status: 201 });
		} else {
			// In cloud mode, pretend success but don't write
			return json({
				success: true,
				mode: 'cloud',
				material: { ...materialData, id: materialType, materialType }
			}, { status: 201 });
		}
	} catch (error) {
		console.error(`Error creating material for brand ${params.brandId}:`, error);
		return json({ error: 'Failed to create material' }, { status: 500 });
	}
};
