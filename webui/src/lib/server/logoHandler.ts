import { writeFile, readFile, mkdir, unlink } from 'fs/promises';
import { join, basename, extname } from 'path';
import { existsSync } from 'fs';
import { validatePathSegment } from './pathValidation';

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export type EntityType = 'brand' | 'store';

export interface SaveLogoResult {
	success: boolean;
	path?: string;
	error?: string;
}

export interface DeleteLogoResult {
	success: boolean;
	error?: string;
}

/**
 * Get the directory path for an entity's logo
 */
export function getLogoDirectory(entityId: string, entityType: EntityType): string {
	const safeId = validatePathSegment(entityId, 'entityId');
	const baseDir = entityType === 'store' ? 'stores' : 'data';
	return join(process.cwd(), '..', baseDir, safeId);
}

/**
 * Parse a data URL and extract its components
 */
export function parseImageDataUrl(imageData: string): { extension: string; base64Data: string } | null {
	const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
	if (!matches) {
		return null;
	}
	const [, extension, base64Data] = matches;
	return { extension, base64Data };
}

/**
 * Save a logo image from a data URL
 */
export async function saveLogo(
	entityId: string,
	imageData: string,
	entityType: EntityType
): Promise<SaveLogoResult> {
	try {
		// Validate that imageData is a data URL
		if (!imageData.startsWith('data:image/')) {
			return { success: false, error: 'Invalid image data' };
		}

		// Extract the base64 data
		const parsed = parseImageDataUrl(imageData);
		if (!parsed) {
			return { success: false, error: 'Invalid image data format' };
		}

		const { extension, base64Data } = parsed;
		const buffer = Buffer.from(base64Data, 'base64');

		if (buffer.length > MAX_LOGO_SIZE_BYTES) {
			return { success: false, error: `Logo exceeds ${MAX_LOGO_SIZE_BYTES / 1024 / 1024}MB size limit` };
		}

		const logoDir = getLogoDirectory(entityId, entityType);

		// Delete any existing logo files first (handles extension changes)
		await deleteLogo(entityId, entityType);

		// Create directory if it doesn't exist
		await mkdir(logoDir, { recursive: true });

		// Save the image file
		const filename = `logo.${extension}`;
		const filepath = join(logoDir, filename);
		console.log(`[POST] Saving ${entityType} logo to: ${filepath}`);
		await writeFile(filepath, buffer);
		console.log(`[POST] Successfully saved ${entityType} logo: ${filename}`);

		return { success: true, path: filename };
	} catch (error) {
		console.error(`Error saving ${entityType} logo:`, error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to save logo'
		};
	}
}

const CONTENT_TYPE_MAP: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.svg': 'image/svg+xml'
};

/**
 * Read a logo file for an entity, returning a Response.
 * Validates filename to prevent path traversal.
 */
export async function readLogo(
	entityId: string,
	filename: string,
	entityType: EntityType
): Promise<Response> {
	// Prevent path traversal
	const safeFilename = basename(filename);
	if (safeFilename !== filename) {
		return new Response('Invalid filename', { status: 400 });
	}

	try {
		const logoDir = getLogoDirectory(entityId, entityType);
		const filepath = join(logoDir, safeFilename);
		const fileBuffer = await readFile(filepath);

		const ext = extname(safeFilename).toLowerCase();
		const contentType = CONTENT_TYPE_MAP[ext] || 'application/octet-stream';

		return new Response(fileBuffer, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=31536000'
			}
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
}

/**
 * Delete all logo files for an entity
 */
export async function deleteLogo(
	entityId: string,
	entityType: EntityType
): Promise<DeleteLogoResult> {
	try {
		const logoDir = getLogoDirectory(entityId, entityType);

		// Delete all possible logo file variations to ensure clean replacement
		const extensions = ['png', 'jpg', 'jpeg', 'svg'];
		console.log(`[DELETE] Attempting to delete ${entityType} logos in: ${logoDir}`);

		const deletionPromises = extensions.map(async (ext) => {
			const filepath = join(logoDir, `logo.${ext}`);
			console.log(`[DELETE] Checking for file: ${filepath}`);
			if (existsSync(filepath)) {
				try {
					await unlink(filepath);
					console.log(`[DELETE] Successfully deleted ${entityType} logo: logo.${ext}`);
				} catch (e) {
					console.warn(`[DELETE] Failed to delete logo.${ext}:`, e);
				}
			} else {
				console.log(`[DELETE] File not found: logo.${ext}`);
			}
		});

		await Promise.all(deletionPromises);

		return { success: true };
	} catch (error) {
		console.error(`Error deleting ${entityType} logo:`, error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to delete logo'
		};
	}
}
