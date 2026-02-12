/**
 * Logo Management Utilities
 *
 * Centralized functions for handling logo upload, saving, and deletion.
 * Supports both 'brand' and 'store' entity types.
 */

import { get } from 'svelte/store';
import { isCloudMode } from '$lib/stores/environment';
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
 * Save a logo image to the server or change store
 * @param entityId - ID of the entity (brand or store)
 * @param dataUrl - Base64 encoded image data URL
 * @param type - Entity type ('brand' or 'store')
 * @returns The path to the saved logo, or null if failed
 */
export async function saveLogoImage(
	entityId: string,
	dataUrl: string,
	type: 'store' | 'brand'
): Promise<string | null> {
	// In cloud mode, store the image in the change store
	if (get(isCloudMode)) {
		try {
			const filename = getLogoFilename(dataUrl);
			const mimeType = getMimeType(dataUrl);
			const base64Data = extractBase64(dataUrl);
			const entityPath = `${type}s/${entityId}`;

			// Create a unique image ID
			const imageId = `${type}_${entityId}_logo_${Date.now()}`;

			// Store the image in the change store
			changeStore.storeImage(imageId, entityPath, 'logo', filename, mimeType, base64Data);

			// Return the image ID so it can be referenced
			return imageId;
		} catch (e) {
			console.error('Error storing logo in change store:', e);
			return null;
		}
	}

	// In local mode, save to the server
	try {
		const endpoint = type === 'brand' ? '/api/brands/logo' : '/api/stores/logo';
		const idField = type === 'brand' ? 'brandId' : 'storeId';

		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				[idField]: entityId,
				imageData: dataUrl,
				type
			})
		});

		if (!response.ok) {
			throw new Error('Failed to save logo');
		}

		const result = await response.json();
		return result.path;
	} catch (e) {
		console.error('Error saving logo:', e);
		return null;
	}
}

/**
 * Delete a logo image from the server
 * @param entityId - ID of the entity (brand or store)
 * @param logoFilename - Filename of the logo to delete
 * @param type - Entity type ('brand' or 'store')
 */
export async function deleteLogoImage(
	entityId: string,
	logoFilename: string,
	type: 'store' | 'brand'
): Promise<void> {
	try {
		const endpoint = type === 'brand' ? '/api/brands/logo' : '/api/stores/logo';
		const idField = type === 'brand' ? 'brandId' : 'storeId';

		const response = await fetch(endpoint, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				[idField]: entityId,
				logoFilename,
				type
			})
		});

		if (!response.ok) {
			console.warn('Failed to delete old logo:', logoFilename);
		}
	} catch (e) {
		console.warn('Error deleting old logo:', e);
	}
}
