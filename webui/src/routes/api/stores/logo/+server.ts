import { json } from '@sveltejs/kit';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { RequestHandler } from './$types';

/**
 * API endpoint for saving store/brand logos
 * POST /api/stores/logo
 * Body: { storeId: string, imageData: string (data URL), type: 'store' | 'brand' }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { storeId, imageData, type = 'store' } = await request.json();

		if (!storeId || !imageData) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Validate that imageData is a data URL
		if (!imageData.startsWith('data:image/')) {
			return json({ error: 'Invalid image data' }, { status: 400 });
		}

		// Extract the base64 data
		const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
		if (!matches) {
			return json({ error: 'Invalid image data format' }, { status: 400 });
		}

		const [, extension, base64Data] = matches;
		const buffer = Buffer.from(base64Data, 'base64');

		// Determine the directory based on type
		const baseDir = type === 'store' ? 'stores' : 'data';
		const logoDir = join(process.cwd(), '..', baseDir, storeId);

		// Create directory if it doesn't exist
		if (!existsSync(logoDir)) {
			await mkdir(logoDir, { recursive: true });
		}

		// Save the image file
		const filename = `logo.${extension}`;
		const filepath = join(logoDir, filename);
		console.log(`[POST] Saving logo to: ${filepath}`);
		await writeFile(filepath, buffer);
		console.log(`[POST] Successfully saved logo: ${filename}`);

		// Return the relative path that will be stored in the JSON
		const relativePath = `${filename}`;

		return json({
			success: true,
			path: relativePath
		});
	} catch (error) {
		console.error('Error saving logo:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to save logo' },
			{ status: 500 }
		);
	}
};

/**
 * API endpoint for deleting store/brand logos
 * DELETE /api/stores/logo
 * Body: { storeId: string, logoFilename: string, type: 'store' | 'brand' }
 */
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { storeId, logoFilename, type = 'store' } = await request.json();

		if (!storeId) {
			return json({ error: 'Missing storeId' }, { status: 400 });
		}

		// Determine the directory based on type
		const baseDir = type === 'store' ? 'stores' : 'data';
		const logoDir = join(process.cwd(), '..', baseDir, storeId);

		// Delete all possible logo file variations to ensure clean replacement
		const extensions = ['png', 'jpg', 'jpeg', 'svg'];
		console.log(`[DELETE] Attempting to delete logos in: ${logoDir}`);
		const deletionPromises = extensions.map(async (ext) => {
			const filepath = join(logoDir, `logo.${ext}`);
			console.log(`[DELETE] Checking for file: ${filepath}`);
			if (existsSync(filepath)) {
				try {
					await unlink(filepath);
					console.log(`[DELETE] Successfully deleted: logo.${ext}`);
				} catch (e) {
					console.warn(`[DELETE] Failed to delete logo.${ext}:`, e);
				}
			} else {
				console.log(`[DELETE] File not found: logo.${ext}`);
			}
		});

		await Promise.all(deletionPromises);

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting logo:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to delete logo' },
			{ status: 500 }
		);
	}
};
