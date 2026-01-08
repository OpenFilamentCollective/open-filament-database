import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';

const STORES_DIR = path.join(process.cwd(), '../stores');

export const GET: RequestHandler = async () => {
	try {
		const storeDirectories = await fs.readdir(STORES_DIR);
		const stores = await Promise.all(
			storeDirectories.map(async (dir) => {
				const storePath = path.join(STORES_DIR, dir, 'store.json');
				try {
					const content = await fs.readFile(storePath, 'utf-8');
					return JSON.parse(content);
				} catch (error) {
					console.error(`Failed to read store: ${dir}`, error);
					return null;
				}
			})
		);

		// Filter out null values from failed reads
		const validStores = stores.filter((store) => store !== null);

		return json(validStores);
	} catch (error) {
		console.error('Error reading stores directory:', error);
		return json([], { status: 500 });
	}
};
