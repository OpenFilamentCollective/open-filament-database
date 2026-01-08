import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';

const SCHEMA_DIR = path.join(process.cwd(), '../dist/api/v1/schemas');

export const GET: RequestHandler = async () => {
	try {
		const schemaPath = path.join(SCHEMA_DIR, 'material_schema.json');
		const content = await fs.readFile(schemaPath, 'utf-8');
		return json(JSON.parse(content));
	} catch (error) {
		console.error('Error reading material schema:', error);
		return json({ error: 'Schema not found' }, { status: 404 });
	}
};
