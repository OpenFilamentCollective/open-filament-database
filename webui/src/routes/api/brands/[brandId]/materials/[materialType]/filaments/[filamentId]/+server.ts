import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeBrandId } from '../../../../../utils';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '../data');

export const GET: RequestHandler = async ({ params }) => {
	try {
		const filamentPath = path.join(
			DATA_DIR,
			params.brandId,
			params.materialType,
			params.filamentId,
			'filament.json'
		);
		const content = await fs.readFile(filamentPath, 'utf-8');
		const filament = JSON.parse(content);
		return json({
			...filament,
			brandId: params.brandId,
			materialType: params.materialType
		});
	} catch (error) {
		console.error(
			`Error reading filament ${params.filamentId} for ${params.brandId}/${params.materialType}:`,
			error
		);
		return json({ error: 'Filament not found' }, { status: 404 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const filament = await request.json();
		const filamentPath = path.join(
			DATA_DIR,
			params.brandId,
			params.materialType,
			params.filamentId,
			'filament.json'
		);
		await fs.writeFile(filamentPath, JSON.stringify(filament, null, 4));
		return json({ success: true });
	} catch (error) {
		console.error(
			`Error saving filament ${params.filamentId} for ${params.brandId}/${params.materialType}:`,
			error
		);
		return json({ error: 'Failed to save filament' }, { status: 500 });
	}
};
