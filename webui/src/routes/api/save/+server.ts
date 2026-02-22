import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'node:child_process';
import { IS_LOCAL } from '$lib/server/cloudProxy';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const STORES_DIR = path.join(REPO_ROOT, 'stores');
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp']);

/**
 * Map an entity path (e.g., "brands/prusament/materials/PLA") to a filesystem path.
 *
 * Path mapping:
 * - stores/{slug}                                     → ../stores/{slug}/store.json
 * - brands/{slug}                                     → ../data/{slug}/brand.json
 * - brands/{slug}/materials/{type}                    → ../data/{slug}/{type}/material.json
 * - brands/{slug}/materials/{type}/filaments/{name}   → ../data/{slug}/{type}/{name}/filament.json
 * - brands/{slug}/materials/{type}/filaments/{name}/variants/{variant} → ../data/{slug}/{type}/{name}/{variant}/variant.json
 */
function entityPathToFsPath(entityPath: string): string | null {
	const parts = entityPath.split('/');

	if (parts[0] === 'stores' && parts.length === 2) {
		return path.join(STORES_DIR, parts[1], 'store.json');
	}

	if (parts[0] === 'brands') {
		if (parts.length === 2) {
			return path.join(DATA_DIR, parts[1], 'brand.json');
		}
		if (parts.length === 4 && parts[2] === 'materials') {
			return path.join(DATA_DIR, parts[1], parts[3], 'material.json');
		}
		if (parts.length === 6 && parts[2] === 'materials' && parts[4] === 'filaments') {
			return path.join(DATA_DIR, parts[1], parts[3], parts[5], 'filament.json');
		}
		if (parts.length === 8 && parts[2] === 'materials' && parts[4] === 'filaments' && parts[6] === 'variants') {
			return path.join(DATA_DIR, parts[1], parts[3], parts[5], parts[7], 'variant.json');
		}
	}

	return null;
}

/**
 * Map an entity path to its directory (for deletion and logo writing).
 */
function entityPathToDir(entityPath: string): string | null {
	const fsPath = entityPathToFsPath(entityPath);
	return fsPath ? path.dirname(fsPath) : null;
}

/**
 * Fields to strip from entity data before writing to disk.
 * These are internal tracking fields added by the webui.
 */
const STRIP_FIELDS = new Set([
	'brandId', 'brand_id', 'materialType', 'filamentDir', 'filament_id', 'slug'
]);

/**
 * Remove internal tracking fields and empty strings from entity data.
 */
function cleanEntityData(data: any): any {
	const clean: Record<string, any> = {};
	for (const [key, value] of Object.entries(data)) {
		if (STRIP_FIELDS.has(key)) continue;

		// Default required fields that would fail validation if empty
		if (key === 'origin' && (value === '' || value === undefined)) {
			clean[key] = 'Unknown';
			continue;
		}

		if (value === '') continue;
		clean[key] = value;
	}
	return clean;
}

/**
 * Run a Python command and return its output.
 */
function runPythonCommand(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		const proc = spawn('python3', args, {
			cwd: REPO_ROOT,
			stdio: ['ignore', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (data) => { stdout += data.toString(); });
		proc.stderr.on('data', (data) => { stderr += data.toString(); });

		proc.on('close', (code) => {
			resolve({ code: code ?? 1, stdout, stderr });
		});

		proc.on('error', (error) => {
			resolve({ code: 1, stdout, stderr: error.message });
		});
	});
}

export const POST: RequestHandler = async ({ request }) => {
	if (!IS_LOCAL) {
		return json({ error: 'Batch save is only available in local mode' }, { status: 403 });
	}

	try {
		const { changes, images } = await request.json();

		if (!changes || !Array.isArray(changes)) {
			return json({ error: 'Invalid request: changes array required' }, { status: 400 });
		}

		const results: Array<{ path: string; operation: string; success: boolean; error?: string }> = [];

		// Process changes: deletes first, then creates/updates
		const deletes = changes.filter((c: any) => c.operation === 'delete');
		const writesAndCreates = changes.filter((c: any) => c.operation !== 'delete');

		// Handle deletes
		for (const change of deletes) {
			const entityDir = entityPathToDir(change.entity.path);
			if (!entityDir) {
				results.push({ path: change.entity.path, operation: 'delete', success: false, error: 'Unknown entity path' });
				continue;
			}

			// Verify resolved path stays within expected directories
			const resolvedDir = path.resolve(entityDir);
			if (!resolvedDir.startsWith(DATA_DIR) && !resolvedDir.startsWith(STORES_DIR)) {
				results.push({ path: change.entity.path, operation: 'delete', success: false, error: 'Invalid entity path' });
				continue;
			}

			try {
				await fs.rm(entityDir, { recursive: true, force: true });
				results.push({ path: change.entity.path, operation: 'delete', success: true });
			} catch (error: any) {
				results.push({ path: change.entity.path, operation: 'delete', success: false, error: error.message });
			}
		}

		// Build image ID → filename map so we can resolve image IDs in entity data
		const imageIdToFilename: Record<string, string> = {};
		if (images && typeof images === 'object') {
			for (const [imageId, imageData] of Object.entries(images) as [string, any][]) {
				if (imageData.filename) {
					imageIdToFilename[imageId] = imageData.filename;
				}
			}
		}

		// Handle creates and updates
		for (const change of writesAndCreates) {
			const fsPath = entityPathToFsPath(change.entity.path);
			if (!fsPath) {
				results.push({ path: change.entity.path, operation: change.operation, success: false, error: 'Unknown entity path' });
				continue;
			}

			// Verify resolved path stays within expected directories
			const resolvedFsPath = path.resolve(fsPath);
			if (!resolvedFsPath.startsWith(DATA_DIR) && !resolvedFsPath.startsWith(STORES_DIR)) {
				results.push({ path: change.entity.path, operation: change.operation, success: false, error: 'Invalid entity path' });
				continue;
			}

			try {
				// Ensure parent directory exists
				await fs.mkdir(path.dirname(fsPath), { recursive: true });

				// Replace image IDs with actual filenames in the entity data
				// (e.g., logo field may contain an image ID like "brand_foo_logo_123")
				if (change.data.logo && imageIdToFilename[change.data.logo]) {
					change.data.logo = imageIdToFilename[change.data.logo];
				}

				// Clean and write the data
				const cleanData = cleanEntityData(change.data);

				// For variant entities, extract sizes into a separate file
				let sizesData = null;
				if (fsPath.endsWith('variant.json') && cleanData.sizes) {
					sizesData = cleanData.sizes;
					delete cleanData.sizes;
				}

				const content = JSON.stringify(cleanData, null, 4) + '\n';
				await fs.writeFile(fsPath, content, 'utf-8');

				// Write sizes.json alongside variant.json if sizes data exists
				if (sizesData && Array.isArray(sizesData) && sizesData.length > 0) {
					const sizesPath = path.join(path.dirname(fsPath), 'sizes.json');
					await fs.writeFile(sizesPath, JSON.stringify(sizesData, null, 4) + '\n', 'utf-8');
				}

				results.push({ path: change.entity.path, operation: change.operation, success: true });
			} catch (error: any) {
				results.push({ path: change.entity.path, operation: change.operation, success: false, error: error.message });
			}
		}

		// Write logo images
		const imageResults: Array<{ entityPath: string; success: boolean; error?: string }> = [];
		if (images && typeof images === 'object') {
			for (const [imageId, imageData] of Object.entries(images) as [string, any][]) {
				// Find which entity this image belongs to by checking the changes
				// The image entityPath is stored on the image reference
				const entityDir = entityPathToDir(imageData.entityPath || '');
				if (!entityDir || !imageData.data || !imageData.filename) {
					imageResults.push({ entityPath: imageData.entityPath || imageId, success: false, error: 'Invalid image data' });
					continue;
				}

				// Validate filename is a safe basename (prevent path traversal)
				const safeFilename = path.basename(imageData.filename);
				if (safeFilename !== imageData.filename) {
					imageResults.push({ entityPath: imageData.entityPath || imageId, success: false, error: 'Invalid filename' });
					continue;
				}

				// Validate file extension is an allowed image type
				const ext = path.extname(safeFilename).toLowerCase();
				if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
					imageResults.push({ entityPath: imageData.entityPath || imageId, success: false, error: `Disallowed image extension: ${ext}` });
					continue;
				}

				// Verify resolved path stays within expected directories
				const resolvedImageDir = path.resolve(entityDir);
				if (!resolvedImageDir.startsWith(DATA_DIR) && !resolvedImageDir.startsWith(STORES_DIR)) {
					imageResults.push({ entityPath: imageData.entityPath || imageId, success: false, error: 'Invalid entity path' });
					continue;
				}

				try {
					const imageBuffer = Buffer.from(imageData.data, 'base64');

					// Enforce file size limit
					if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
						imageResults.push({ entityPath: imageData.entityPath || imageId, success: false, error: `Image exceeds ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB limit` });
						continue;
					}

					await fs.mkdir(entityDir, { recursive: true });
					await fs.writeFile(path.join(entityDir, safeFilename), imageBuffer);
					imageResults.push({ entityPath: imageData.entityPath, success: true });
				} catch (error: any) {
					imageResults.push({ entityPath: imageData.entityPath || imageId, success: false, error: error.message });
				}
			}
		}

		// Check if any changes failed
		const hasErrors = results.some(r => !r.success) || imageResults.some(r => !r.success);
		if (hasErrors) {
			return json({
				success: false,
				message: 'Some changes failed to save',
				results,
				imageResults
			}, { status: 207 });
		}

		// Run style_data (key sorting)
		const styleResult = await runPythonCommand(['-m', 'ofd', 'script', 'style_data', '--json']);
		let styleData = null;
		try {
			styleData = JSON.parse(styleResult.stdout);
		} catch {
			styleData = { raw: styleResult.stdout, stderr: styleResult.stderr };
		}

		// Run validation
		const validateResult = await runPythonCommand(['-m', 'ofd', 'validate', '--json']);
		let validation = null;
		try {
			validation = JSON.parse(validateResult.stdout);
		} catch {
			validation = { raw: validateResult.stdout, stderr: validateResult.stderr };
		}

		return json({
			success: true,
			message: `Saved ${results.length} changes`,
			results,
			imageResults,
			styleData,
			validation
		});
	} catch (error: any) {
		console.error('Batch save error:', error);
		return json({ error: 'Failed to save changes', details: error.message }, { status: 500 });
	}
};
