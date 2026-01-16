import { promises as fs } from 'fs';
import path from 'path';

/**
 * Normalize brand ID to match filesystem directory name.
 * Tries the ID as-is first, then tries replacing hyphens with underscores.
 *
 * @param dataDir - The base data directory
 * @param brandId - The brand ID from the URL (might have hyphens)
 * @returns The normalized brand ID that matches the filesystem directory
 */
export async function normalizeBrandId(dataDir: string, brandId: string): Promise<string> {
	// Try with the ID as-is first
	try {
		const brandDir = path.join(dataDir, brandId);
		await fs.access(brandDir);
		return brandId;
	} catch {
		// If not found, try replacing hyphens with underscores
		const normalizedId = brandId.replace(/-/g, '_');
		const brandDir = path.join(dataDir, normalizedId);
		await fs.access(brandDir);
		return normalizedId;
	}
}
