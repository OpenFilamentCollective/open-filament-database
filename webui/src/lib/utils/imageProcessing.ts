/**
 * Image processing utilities for logo upload and validation
 */

export interface ImageValidationResult {
	valid: boolean;
	width: number;
	height: number;
	isSquare: boolean;
	needsResize: boolean;
	needsCrop: boolean;
	error?: string;
}

export interface ProcessedImage {
	dataUrl: string;
	width: number;
	height: number;
}

const MIN_SIZE = 100;
const MAX_SIZE = 400;

/**
 * Validate an image file
 */
export async function validateImage(file: File): Promise<ImageValidationResult> {
	return new Promise((resolve) => {
		// Check if it's an image
		if (!file.type.startsWith('image/')) {
			resolve({
				valid: false,
				width: 0,
				height: 0,
				isSquare: false,
				needsResize: false,
				needsCrop: false,
				error: 'File must be an image'
			});
			return;
		}

		const img = new Image();
		const reader = new FileReader();

		reader.onload = (e) => {
			img.onload = () => {
				const width = img.width;
				const height = img.height;
				const isSquare = width === height;
				const needsResize = isSquare && (width < MIN_SIZE || width > MAX_SIZE);
				const needsCrop = !isSquare;

				resolve({
					valid: true,
					width,
					height,
					isSquare,
					needsResize,
					needsCrop,
					error: undefined
				});
			};

			img.onerror = () => {
				resolve({
					valid: false,
					width: 0,
					height: 0,
					isSquare: false,
					needsResize: false,
					needsCrop: false,
					error: 'Failed to load image'
				});
			};

			img.src = e.target?.result as string;
		};

		reader.onerror = () => {
			resolve({
				valid: false,
				width: 0,
				height: 0,
				isSquare: false,
				needsResize: false,
				needsCrop: false,
				error: 'Failed to read file'
			});
		};

		reader.readAsDataURL(file);
	});
}

/**
 * Resize an image to fit within MIN_SIZE and MAX_SIZE
 */
export async function resizeImage(
	imageDataUrl: string,
	targetSize?: number
): Promise<ProcessedImage> {
	return new Promise((resolve, reject) => {
		const img = new Image();

		img.onload = () => {
			const width = img.width;
			const height = img.height;

			// Calculate target size
			let newSize = targetSize;
			if (!newSize) {
				if (width < MIN_SIZE) {
					newSize = MIN_SIZE;
				} else if (width > MAX_SIZE) {
					newSize = MAX_SIZE;
				} else {
					// Already in range
					resolve({ dataUrl: imageDataUrl, width, height });
					return;
				}
			}

			// Create canvas
			const canvas = document.createElement('canvas');
			canvas.width = newSize;
			canvas.height = newSize;

			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(new Error('Failed to get canvas context'));
				return;
			}

			// Draw resized image
			ctx.drawImage(img, 0, 0, newSize, newSize);

			// Convert to data URL
			const dataUrl = canvas.toDataURL('image/png');

			resolve({
				dataUrl,
				width: newSize,
				height: newSize
			});
		};

		img.onerror = () => {
			reject(new Error('Failed to load image for resizing'));
		};

		img.src = imageDataUrl;
	});
}

/**
 * Crop an image to a square
 */
export async function cropImage(
	imageDataUrl: string,
	cropX: number,
	cropY: number,
	cropSize: number,
	targetSize?: number
): Promise<ProcessedImage> {
	return new Promise((resolve, reject) => {
		const img = new Image();

		img.onload = async () => {
			// Calculate final size
			let finalSize = cropSize;
			if (targetSize) {
				finalSize = targetSize;
			} else if (cropSize < MIN_SIZE) {
				finalSize = MIN_SIZE;
			} else if (cropSize > MAX_SIZE) {
				finalSize = MAX_SIZE;
			}

			// Create canvas
			const canvas = document.createElement('canvas');
			canvas.width = finalSize;
			canvas.height = finalSize;

			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(new Error('Failed to get canvas context'));
				return;
			}

			// Draw cropped and resized image
			ctx.drawImage(
				img,
				cropX,
				cropY,
				cropSize,
				cropSize,
				0,
				0,
				finalSize,
				finalSize
			);

			// Convert to data URL
			const dataUrl = canvas.toDataURL('image/png');

			resolve({
				dataUrl,
				width: finalSize,
				height: finalSize
			});
		};

		img.onerror = () => {
			reject(new Error('Failed to load image for cropping'));
		};

		img.src = imageDataUrl;
	});
}

/**
 * Convert a File to a data URL
 */
export async function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = (e) => {
			resolve(e.target?.result as string);
		};

		reader.onerror = () => {
			reject(new Error('Failed to read file'));
		};

		reader.readAsDataURL(file);
	});
}

/**
 * Process an uploaded image file
 * Returns the processed image data URL ready to be saved
 */
export async function processUploadedImage(file: File): Promise<ProcessedImage> {
	// First validate the image
	const validation = await validateImage(file);

	if (!validation.valid) {
		throw new Error(validation.error || 'Invalid image');
	}

	// Convert to data URL
	const dataUrl = await fileToDataUrl(file);

	// If it's square and in the right size range, return as-is
	if (validation.isSquare && !validation.needsResize) {
		return {
			dataUrl,
			width: validation.width,
			height: validation.height
		};
	}

	// If it's square but needs resizing
	if (validation.isSquare && validation.needsResize) {
		return await resizeImage(dataUrl);
	}

	// If it's not square, we need to crop it (handled by component)
	throw new Error('IMAGE_NEEDS_CROP');
}
