import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';

const SCHEMA_PATH = path.join(process.cwd(), '../schemas/store_schema.json');

export const GET: RequestHandler = async () => {
	try {
		const content = await fs.readFile(SCHEMA_PATH, 'utf-8');
		return json(JSON.parse(content));
	} catch (error) {
		console.error('Failed to read store schema:', error);
		return json({ error: 'Schema not found' }, { status: 404 });
	}
};
