import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { PUBLIC_APP_MODE } from '$env/static/public';

const STORES_DIR = path.join(process.cwd(), '../stores');
const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	const storePath = path.join(STORES_DIR, id, 'store.json');

	try {
		const content = await fs.readFile(storePath, 'utf-8');
		return json(JSON.parse(content));
	} catch (error) {
		console.error(`Failed to read store ${id}:`, error);
		return json({ error: 'Store not found' }, { status: 404 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	const store = await request.json();

	// Validate that the ID matches
	if (store.id !== id) {
		return json({ error: 'Store ID mismatch' }, { status: 400 });
	}

	// In local mode, write directly to the file system
	if (IS_LOCAL) {
		const storePath = path.join(STORES_DIR, id, 'store.json');

		try {
			// Pretty print with 4 spaces indentation
			const content = JSON.stringify(store, null, 4) + '\n';
			await fs.writeFile(storePath, content, 'utf-8');
			return json({ success: true });
		} catch (error) {
			console.error(`Failed to write store ${id}:`, error);
			return json({ error: 'Failed to save store' }, { status: 500 });
		}
	} else {
		// In cloud mode, we don't actually write to the filesystem
		// The client will handle storing changes locally and exporting
		return json({ success: true, mode: 'cloud' });
	}
};
