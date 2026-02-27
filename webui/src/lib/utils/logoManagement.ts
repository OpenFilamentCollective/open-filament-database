/**
 * Logo Management Utilities
 *
 * Centralized functions for handling logo upload, saving, and deletion.
 * Supports both 'brand' and 'store' entity types.
 */

import { changeStore } from '$lib/stores/changes';

/**
 * Extract the filename from a data URL
 * @param dataUrl - Base64 encoded image data URL
 * @returns Filename with appropriate extension (e.g., 'logo.png', 'logo.svg')
 */
export function getLogoFilename(dataUrl: string): string {
	// Extract the file type from the data URL
	// Match image/png, image/jpeg, image/svg+xml, etc.
	const match = dataUrl.match(/^data:image\/([\w+]+);base64,/);
	if (match) {
		let extension = match[1];
		// Handle svg+xml -> svg
		if (extension === 'svg+xml') {
			extension = 'svg';
		}
		return `logo.${extension}`;
	}
	return 'logo.png'; // Default fallback
}

/**
 * Extract MIME type from a data URL
 * @param dataUrl - Base64 encoded image data URL
 * @returns MIME type (e.g., 'image/png', 'image/svg+xml')
 */
export function getMimeType(dataUrl: string): string {
	const match = dataUrl.match(/^data:(image\/[\w+]+);base64,/);
	if (match) {
		return match[1];
	}
	return 'image/png'; // Default fallback
}

/**
 * Extract base64 data from a data URL
 * @param dataUrl - Base64 encoded image data URL
 * @returns Base64 string without the data URL prefix
 */
export function extractBase64(dataUrl: string): string {
	// Use indexOf for reliable splitting (regex .+ can't span newlines)
	const marker = ';base64,';
	const idx = dataUrl.indexOf(marker);
	if (idx !== -1 && dataUrl.startsWith('data:')) {
		return dataUrl.slice(idx + marker.length);
	}
	return dataUrl; // Return as-is if no match
}

/**
 * Store a logo image in the change store (written to disk on save)
 * @param entityId - ID of the entity (brand or store)
 * @param dataUrl - Base64 encoded image data URL
 * @param type - Entity type ('brand' or 'store')
 * @returns The image ID for referencing in entity data, or null if failed
 */
export async function saveLogoImage(
	entityId: string,
	dataUrl: string,
	type: 'store' | 'brand'
): Promise<string | null> {
	try {
		const filename = getLogoFilename(dataUrl);
		const mimeType = getMimeType(dataUrl);
		const base64Data = extractBase64(dataUrl);
		const entityPath = `${type}s/${entityId}`;

		// Create a unique image ID
		const imageId = `${type}_${entityId}_logo_${Date.now()}`;

		// Store the image in the change store (written to disk on save)
		changeStore.storeImage(imageId, entityPath, 'logo', filename, mimeType, base64Data);

		// Return the image ID so it can be referenced
		return imageId;
	} catch (e) {
		console.error('Error storing logo in change store:', e);
		return null;
	}
}
