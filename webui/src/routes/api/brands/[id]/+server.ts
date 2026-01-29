import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { PUBLIC_APP_MODE } from '$env/static/public';

const DATA_DIR = path.join(process.cwd(), '../data');
const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

/**
 * Normalize brand ID to match filesystem directory name.
 * Tries with underscores first, then tries with hyphens converted to underscores.
 */
async function normalizeBrandId(brandId: string): Promise<string> {
	try {
		const brandDir = path.join(DATA_DIR, brandId);
		await fs.access(brandDir);
		return brandId;
	} catch {
		// Try converting hyphens to underscores
		const normalizedId = brandId.replace(/-/g, '_');
		const brandDir = path.join(DATA_DIR, normalizedId);
		await fs.access(brandDir);
		return normalizedId;
	}
}

export const GET: RequestHandler = async ({ params }) => {
	try {
		const normalizedId = await normalizeBrandId(params.id);
		const brandPath = path.join(DATA_DIR, normalizedId, 'brand.json');
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
		const normalizedId = await normalizeBrandId(params.id);
		const brandPath = path.join(DATA_DIR, normalizedId, 'brand.json');
		await fs.writeFile(brandPath, JSON.stringify(brand, null, 4) + '\n');
		return json({ success: true });
	} catch (error) {
		console.error(`Error saving brand ${params.id}:`, error);
		return json({ error: 'Failed to save brand' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Only allow deletion in local mode
	if (!IS_LOCAL) {
		return json({ error: 'Deletion not allowed in cloud mode' }, { status: 403 });
	}

	try {
		const normalizedId = await normalizeBrandId(id);
		const brandDir = path.join(DATA_DIR, normalizedId);

		// Remove the entire brand directory
		await fs.rm(brandDir, { recursive: true, force: true });

		return json({ success: true });
	} catch (error) {
		console.error(`Failed to delete brand ${id}:`, error);
		return json({ error: 'Failed to delete brand' }, { status: 500 });
	}
};
