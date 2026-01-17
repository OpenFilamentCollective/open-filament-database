import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { normalizeBrandId } from '../../../utils';

const DATA_DIR = path.join(process.cwd(), '../data');

export const GET: RequestHandler = async ({ params }) => {
	try {
		const normalizedBrandId = await normalizeBrandId(DATA_DIR, params.brandId);
		const materialPath = path.join(
			DATA_DIR,
			normalizedBrandId,
			params.materialType,
			'material.json'
		);
		const content = await fs.readFile(materialPath, 'utf-8');
		const material = JSON.parse(content);
		return json({
			...material,
			id: params.materialType, // Use materialType as id for change tracking
			brandId: params.brandId,
			materialType: params.materialType
		});
	} catch (error) {
		console.error(
			`Error reading material ${params.materialType} for brand ${params.brandId}:`,
			error
		);
		return json({ error: 'Material not found' }, { status: 404 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const { PUBLIC_APP_MODE } = await import('$env/static/public');
		const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

		const material = await request.json();

		if (IS_LOCAL) {
			const normalizedBrandId = await normalizeBrandId(DATA_DIR, params.brandId);
			const materialPath = path.join(
				DATA_DIR,
				normalizedBrandId,
				params.materialType,
				'material.json'
			);
			// Remove internal tracking fields before saving
			const { id, brandId, materialType, ...cleanData } = material;
			const content = JSON.stringify(cleanData, null, 4) + '\n';
			await fs.writeFile(materialPath, content, 'utf-8');
			return json({ success: true });
		} else {
			return json({ success: true, mode: 'cloud' });
		}
	} catch (error) {
		console.error(
			`Error saving material ${params.materialType} for brand ${params.brandId}:`,
			error
		);
		return json({ error: 'Failed to save material' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const { PUBLIC_APP_MODE } = await import('$env/static/public');
		const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

		if (IS_LOCAL) {
			const normalizedBrandId = await normalizeBrandId(DATA_DIR, params.brandId);
			const materialDir = path.join(DATA_DIR, normalizedBrandId, params.materialType);

			// Recursively delete the material directory and all its contents
			await fs.rm(materialDir, { recursive: true, force: true });

			return json({ success: true });
		} else {
			return json({ success: true, mode: 'cloud' });
		}
	} catch (error) {
		console.error(
			`Error deleting material ${params.materialType} for brand ${params.brandId}:`,
			error
		);
		return json({ error: 'Failed to delete material' }, { status: 500 });
	}
};
