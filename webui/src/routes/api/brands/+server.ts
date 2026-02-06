import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '../data');

export const GET: RequestHandler = async () => {
	try {
		const brandDirectories = await fs.readdir(DATA_DIR);
		const brands = await Promise.all(
			brandDirectories.map(async (dir) => {
				const brandPath = path.join(DATA_DIR, dir, 'brand.json');
				try {
					const content = await fs.readFile(brandPath, 'utf-8');
					return JSON.parse(content);
				} catch (error) {
					// Not all directories may have a brand.json
					return null;
				}
			})
		);

		// Filter out null values from directories without brand.json
		const validBrands = brands.filter((brand) => brand !== null);

		return json(validBrands);
	} catch (error) {
		console.error('Error reading data directory:', error);
		return json([], { status: 500 });
	}
};
