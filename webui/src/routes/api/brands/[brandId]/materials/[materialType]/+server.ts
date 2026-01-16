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
		const normalizedBrandId = await normalizeBrandId(DATA_DIR, params.brandId);
		const material = await request.json();
		const materialPath = path.join(
			DATA_DIR,
			normalizedBrandId,
			params.materialType,
			'material.json'
		);
		await fs.writeFile(materialPath, JSON.stringify(material, null, 4));
		return json({ success: true });
	} catch (error) {
		console.error(
			`Error saving material ${params.materialType} for brand ${params.brandId}:`,
			error
		);
		return json({ error: 'Failed to save material' }, { status: 500 });
	}
};
