import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, stat } from 'fs/promises';
import { join, resolve, extname } from 'path';
import { getDataDir, getStoresDir } from '$lib/server/dataIndex';

const MIME_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon'
};

export const GET: RequestHandler = async ({ params }) => {
	const requestedPath = params.path;

	if (!requestedPath) {
		return error(400, 'Path is required');
	}

	// Security: prevent path traversal
	if (requestedPath.includes('..') || requestedPath.startsWith('/')) {
		return error(400, 'Invalid path');
	}

	// Try data directory first, then stores directory
	const dataDir = getDataDir();
	const storesDir = getStoresDir();

	let filePath: string | null = null;
	let resolvedPath: string;

	// Check data directory
	resolvedPath = resolve(join(dataDir, requestedPath));
	if (resolvedPath.startsWith(dataDir)) {
		try {
			await stat(resolvedPath);
			filePath = resolvedPath;
		} catch {
			// File not found in data dir, try stores
		}
	}

	// Check stores directory if not found in data
	if (!filePath) {
		resolvedPath = resolve(join(storesDir, requestedPath));
		if (resolvedPath.startsWith(storesDir)) {
			try {
				await stat(resolvedPath);
				filePath = resolvedPath;
			} catch {
				// File not found in stores dir either
			}
		}
	}

	if (!filePath) {
		return error(404, 'Image not found');
	}

	// Check file extension
	const ext = extname(filePath).toLowerCase();
	const mimeType = MIME_TYPES[ext];

	if (!mimeType) {
		return error(400, 'Unsupported file type');
	}

	try {
		const fileBuffer = await readFile(filePath);
		return new Response(fileBuffer, {
			headers: {
				'Content-Type': mimeType,
				'Cache-Control': 'public, max-age=86400' // Cache for 1 day
			}
		});
	} catch {
		return error(500, 'Failed to read image');
	}
};
