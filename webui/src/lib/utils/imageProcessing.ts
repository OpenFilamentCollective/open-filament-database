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
 * Detect if a data URL is an SVG
 */
export function isSvgDataUrl(dataUrl: string): boolean {
	return dataUrl.startsWith('data:image/svg');
}

/**
 * Process an SVG file to fit 400x400 canvas
 * Centers all elements and scales until something hits the border
 * @param svgDataUrl - SVG file as data URL
 * @returns Processed SVG as data URL
 */
export async function processSvg(svgDataUrl: string): Promise<ProcessedImage> {
	return new Promise((resolve, reject) => {
		try {
			// Parse SVG from data URL
			const base64 = svgDataUrl.split(',')[1];
			const svgText = atob(base64);

			// Create DOM parser
			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
			const svgElement = svgDoc.documentElement as unknown as SVGSVGElement;

			// Check for parsing errors
			const parserError = svgDoc.querySelector('parsererror');
			if (parserError) {
				reject(new Error('Invalid SVG file'));
				return;
			}

			// Get or calculate bounding box
			const viewBox = svgElement.getAttribute('viewBox');
			let bbox: { x: number; y: number; width: number; height: number };

			if (viewBox) {
				const parts = viewBox.trim().split(/\s+|,/);
				const [x, y, w, h] = parts.map(Number);
				bbox = { x, y, width: w, height: h };
			} else {
				// Calculate from content using temporary DOM element
				const tempDiv = document.createElement('div');
				tempDiv.style.position = 'absolute';
				tempDiv.style.visibility = 'hidden';
				tempDiv.style.width = '0';
				tempDiv.style.height = '0';
				tempDiv.innerHTML = svgText;
				document.body.appendChild(tempDiv);

				try {
					const tempSvg = tempDiv.querySelector('svg') as SVGSVGElement;
					if (tempSvg) {
						// Get bounding box of all content
						const bboxResult = tempSvg.getBBox();
						bbox = {
							x: bboxResult.x,
							y: bboxResult.y,
							width: bboxResult.width,
							height: bboxResult.height
						};
					} else {
						// Fallback if getBBox fails
						bbox = { x: 0, y: 0, width: 400, height: 400 };
					}
				} finally {
					document.body.removeChild(tempDiv);
				}
			}

			// Ensure bbox has valid dimensions
			if (bbox.width <= 0 || bbox.height <= 0) {
				bbox = { x: 0, y: 0, width: 400, height: 400 };
			}

			// Calculate scale to fit 400x400 (scale until max dimension hits 400)
			const maxDim = Math.max(bbox.width, bbox.height);
			const scale = 400 / maxDim;

			// Calculate centering offset
			const scaledWidth = bbox.width * scale;
			const scaledHeight = bbox.height * scale;
			const offsetX = (400 - scaledWidth) / 2;
			const offsetY = (400 - scaledHeight) / 2;

			// Set new viewBox centered in 400x400 space
			// Transform coordinates: newX = bbox.x - (offsetX / scale)
			const newX = bbox.x - offsetX / scale;
			const newY = bbox.y - offsetY / scale;
			const newWidth = 400 / scale;
			const newHeight = 400 / scale;

			svgElement.setAttribute('viewBox', `${newX} ${newY} ${newWidth} ${newHeight}`);
			svgElement.setAttribute('width', '400');
			svgElement.setAttribute('height', '400');

			// Serialize back to string
			const serializer = new XMLSerializer();
			const processedSvg = serializer.serializeToString(svgElement);

			// Convert back to data URL
			const processedBase64 = btoa(processedSvg);
			const dataUrl = `data:image/svg+xml;base64,${processedBase64}`;

			resolve({
				dataUrl,
				width: 400,
				height: 400
			});
		} catch (e) {
			reject(new Error(`Failed to process SVG: ${e instanceof Error ? e.message : 'Unknown error'}`));
		}
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
