import { get } from 'svelte/store';
import { useChangeTracking } from '$lib/stores/environment';
import { changeStore } from '$lib/stores/changes';

/**
 * Service for handling image storage in cloud mode
 * Images are stored as base64 in localStorage with references in the change tracking system
 */
export class ImageStorageService {
	private static instance: ImageStorageService;
	private blobUrls: Map<string, string> = new Map();

	private constructor() {}

	static getInstance(): ImageStorageService {
		if (!ImageStorageService.instance) {
			ImageStorageService.instance = new ImageStorageService();
		}
		return ImageStorageService.instance;
	}

	/**
	 * Generate a unique ID for an image
	 */
	private generateImageId(entityPath: string, property: string): string {
		return `${entityPath.replace(/\//g, '_')}_${property}_${Date.now()}`;
	}

	/**
	 * Read a file as base64
	 */
	private async fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				// Remove data URL prefix if present
				const base64 = result.includes(',') ? result.split(',')[1] : result;
				resolve(base64);
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	/**
	 * Store an image for an entity
	 * @param entityPath - Path to the entity (e.g., "stores/acme")
	 * @param property - Property name (e.g., "logo")
	 * @param file - The image file
	 * @returns The image ID to reference in the entity data
	 */
	async storeImage(entityPath: string, property: string, file: File): Promise<string> {
		if (!get(useChangeTracking)) {
			throw new Error('Image storage is only available in cloud mode');
		}

		// Validate file type
		if (!file.type.startsWith('image/')) {
			throw new Error('File must be an image');
		}

		// Convert to base64
		const base64Data = await this.fileToBase64(file);

		// Generate unique ID
		const imageId = this.generateImageId(entityPath, property);

		// Store in change tracking system
		changeStore.storeImage(imageId, entityPath, property, file.name, file.type, base64Data);

		return imageId;
	}

	/**
	 * Get an image by ID
	 * @param imageId - The image ID
	 * @returns Base64-encoded image data with data URL prefix
	 */
	getImage(imageId: string): string | null {
		const base64 = changeStore.getImage(imageId);

		if (!base64) return null;

		// We need to add the data URL prefix
		// Try to determine the MIME type from the stored image references
		const changeSet = get(changeStore);
		const imageRef = changeSet.images[imageId];

		if (imageRef) {
			return `data:${imageRef.mimeType};base64,${base64}`;
		}

		// Fallback to generic image type
		return `data:image/png;base64,${base64}`;
	}

	/**
	 * Store an image from a data URL or base64 string
	 * @param entityPath - Path to the entity
	 * @param property - Property name
	 * @param dataUrl - Data URL or base64 string
	 * @param filename - Original filename
	 * @returns The image ID
	 */
	storeImageFromDataUrl(
		entityPath: string,
		property: string,
		dataUrl: string,
		filename: string = 'image.png'
	): string {
		if (!get(useChangeTracking)) {
			throw new Error('Image storage is only available in cloud mode');
		}

		// Parse data URL
		let base64Data: string;
		let mimeType: string;

		if (dataUrl.startsWith('data:')) {
			const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
			if (!match) {
				throw new Error('Invalid data URL format');
			}
			mimeType = match[1];
			base64Data = match[2];
		} else {
			// Assume raw base64
			base64Data = dataUrl;
			mimeType = 'image/png'; // Default
		}

		// Generate unique ID
		const imageId = this.generateImageId(entityPath, property);

		// Store in change tracking system
		changeStore.storeImage(imageId, entityPath, property, filename, mimeType, base64Data);

		return imageId;
	}

	/**
	 * Create a blob URL for an image (useful for previews)
	 * @param imageId - The image ID
	 * @returns Blob URL or null if image not found
	 */
	createBlobUrl(imageId: string): string | null {
		const dataUrl = this.getImage(imageId);

		if (!dataUrl) return null;

		// Revoke any previous blob URL for this image to prevent memory leaks
		const existingBlobUrl = this.blobUrls.get(imageId);
		if (existingBlobUrl) {
			URL.revokeObjectURL(existingBlobUrl);
			this.blobUrls.delete(imageId);
		}

		// Convert data URL to blob
		const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
		if (!match) return null;

		const mimeType = match[1];
		const base64 = match[2];

		try {
			const byteCharacters = atob(base64);
			const byteNumbers = new Array(byteCharacters.length);

			for (let i = 0; i < byteCharacters.length; i++) {
				byteNumbers[i] = byteCharacters.charCodeAt(i);
			}

			const byteArray = new Uint8Array(byteNumbers);
			const blob = new Blob([byteArray], { type: mimeType });

			const blobUrl = URL.createObjectURL(blob);
			this.blobUrls.set(imageId, blobUrl);
			return blobUrl;
		} catch (e) {
			console.error('Failed to create blob URL:', e);
			return null;
		}
	}

	/**
	 * Revoke a blob URL for an image, freeing memory
	 * @param imageId - The image ID whose blob URL should be revoked
	 */
	revokeBlobUrl(imageId: string): void {
		const blobUrl = this.blobUrls.get(imageId);
		if (blobUrl) {
			URL.revokeObjectURL(blobUrl);
			this.blobUrls.delete(imageId);
		}
	}

	/**
	 * Revoke all tracked blob URLs, freeing memory
	 */
	revokeAllBlobUrls(): void {
		for (const blobUrl of this.blobUrls.values()) {
			URL.revokeObjectURL(blobUrl);
		}
		this.blobUrls.clear();
	}

	/**
	 * Get storage statistics
	 */
	getStorageStats(): { count: number; estimatedSize: number } {
		const changeSet = get(changeStore);
		const imageRefs = Object.values(changeSet.images);

		let estimatedSize = 0;

		for (const ref of imageRefs) {
			const data = changeStore.getImage(ref.id);
			if (data) {
				// Base64 encoding increases size by ~33%
				// Estimate original size by removing base64 overhead
				estimatedSize += (data.length * 3) / 4;
			}
		}

		return {
			count: imageRefs.length,
			estimatedSize: Math.round(estimatedSize)
		};
	}
}

export const imageStorage = ImageStorageService.getInstance();
