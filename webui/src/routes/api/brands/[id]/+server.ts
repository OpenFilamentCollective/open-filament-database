import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '../data');

export const GET: RequestHandler = async ({ params }) => {
	try {
		const brandPath = path.join(DATA_DIR, params.id, 'brand.json');
		const content = await fs.readFile(brandPath, 'utf-8');
		return json(JSON.parse(content));
	} catch (error) {
		console.error(`Error reading brand ${params.id}:`, error);
		return json({ error: 'Brand not found' }, { status: 404 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const brand = await request.json();
		const brandPath = path.join(DATA_DIR, params.id, 'brand.json');
		await fs.writeFile(brandPath, JSON.stringify(brand, null, 4));
		return json({ success: true });
	} catch (error) {
		console.error(`Error saving brand ${params.id}:`, error);
		return json({ error: 'Failed to save brand' }, { status: 500 });
	}
};
