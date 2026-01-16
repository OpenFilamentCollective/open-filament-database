import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { PUBLIC_APP_MODE } from '$env/static/public';

const STORES_DIR = path.join(process.cwd(), '../stores');
const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

/**
 * Normalize store ID to match filesystem directory name.
 * Tries with hyphens first, then tries without hyphens.
 */
async function normalizeStoreId(storeId: string): Promise<string> {
	try {
		const storeDir = path.join(STORES_DIR, storeId);
		await fs.access(storeDir);
		return storeId;
	} catch {
		// Try removing hyphens
		const normalizedId = storeId.replace(/-/g, '');
		const storeDir = path.join(STORES_DIR, normalizedId);
		await fs.access(storeDir);
		return normalizedId;
	}
}

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		const normalizedId = await normalizeStoreId(id);
		const storePath = path.join(STORES_DIR, normalizedId, 'store.json');
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
		const normalizedId = await normalizeStoreId(id);
		const storePath = path.join(STORES_DIR, normalizedId, 'store.json');

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

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Only allow deletion in local mode
	if (!IS_LOCAL) {
		return json({ error: 'Deletion not allowed in cloud mode' }, { status: 403 });
	}

	try {
		const normalizedId = await normalizeStoreId(id);
		const storeDir = path.join(STORES_DIR, normalizedId);

		// Remove the entire store directory
		await fs.rm(storeDir, { recursive: true, force: true });

		return json({ success: true });
	} catch (error) {
		console.error(`Failed to delete store ${id}:`, error);
		return json({ error: 'Failed to delete store' }, { status: 500 });
	}
};
