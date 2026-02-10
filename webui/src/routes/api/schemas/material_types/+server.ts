import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { IS_CLOUD, proxyGetToCloud } from '$lib/server/cloudProxy';

const SCHEMA_DIR = path.join(process.cwd(), '../schemas');

export const GET: RequestHandler = async () => {
	if (IS_CLOUD) return proxyGetToCloud('/api/schemas/material_types');

	try {
		const schemaPath = path.join(SCHEMA_DIR, 'material_types_schema.json');
		const content = await fs.readFile(schemaPath, 'utf-8');
		return json(JSON.parse(content));
	} catch (error) {
		console.error('Error reading material_types schema:', error);
		return json({ error: 'Schema not found' }, { status: 404 });
	}
};
