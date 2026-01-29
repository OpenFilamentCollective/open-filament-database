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
		const { PUBLIC_APP_MODE } = await import('$env/static/public');
		const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

		const filament = await request.json();

		if (IS_LOCAL) {
			const filamentPath = path.join(
				DATA_DIR,
				params.brandId,
				params.materialType,
				params.filamentId,
				'filament.json'
			);
			// Remove internal tracking fields before saving
			const { brandId, materialType, filamentDir, ...cleanData } = filament;
			const content = JSON.stringify(cleanData, null, 4) + '\n';
			await fs.writeFile(filamentPath, content, 'utf-8');
			return json({ success: true });
		} else {
			return json({ success: true, mode: 'cloud' });
		}
	} catch (error) {
		console.error(
			`Error saving filament ${params.filamentId} for ${params.brandId}/${params.materialType}:`,
			error
		);
		return json({ error: 'Failed to save filament' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const { PUBLIC_APP_MODE } = await import('$env/static/public');
		const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

		if (IS_LOCAL) {
			const filamentDir = path.join(
				DATA_DIR,
				params.brandId,
				params.materialType,
				params.filamentId
			);

			// Recursively delete the filament directory and all its contents (including variants)
			await fs.rm(filamentDir, { recursive: true, force: true });

			return json({ success: true });
		} else {
			return json({ success: true, mode: 'cloud' });
		}
	} catch (error) {
		console.error(
			`Error deleting filament ${params.filamentId} for ${params.brandId}/${params.materialType}:`,
			error
		);
		return json({ error: 'Failed to delete filament' }, { status: 500 });
	}
};
