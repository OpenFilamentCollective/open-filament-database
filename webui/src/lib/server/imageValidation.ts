/**
 * Server-side logo image validation.
 * Parses PNG/JPEG headers for dimensions and validates SVG structure.
 * No external dependencies — uses only Node.js Buffer.
 */

import { Buffer } from 'node:buffer';

// --- Types ---

export interface ValidationError {
	category: string;
	level: 'ERROR' | 'WARNING';
	message: string;
	path?: string;
}

interface ImageDimensions {
	width: number;
	height: number;
}

// --- Constants (matching Rust validator) ---

export const LOGO_MIN_SIZE = 100;
export const LOGO_MAX_SIZE = 400;

// --- PNG parsing ---

/**
 * Extract dimensions from a PNG buffer by reading the IHDR chunk.
 * PNG spec: bytes 0-7 = signature, 8-15 = IHDR chunk header,
 * 16-19 = width (big-endian u32), 20-23 = height (big-endian u32).
 */
export function getPngDimensions(buffer: Buffer): ImageDimensions | null {
	if (buffer.length < 24) return null;
	// PNG signature: 0x89 P N G \r \n 0x1A \n
	if (
		buffer[0] !== 0x89 ||
		buffer[1] !== 0x50 ||
		buffer[2] !== 0x4e ||
		buffer[3] !== 0x47 ||
		buffer[4] !== 0x0d ||
		buffer[5] !== 0x0a ||
		buffer[6] !== 0x1a ||
		buffer[7] !== 0x0a
	) {
		return null;
	}
	const width = buffer.readUInt32BE(16);
	const height = buffer.readUInt32BE(20);
	return { width, height };
}

// --- JPEG parsing ---

/**
 * Extract dimensions from a JPEG buffer by scanning for SOF markers.
 * SOF0 (0xC0), SOF2 (0xC2), etc. contain height at offset+5, width at offset+7.
 */
export function getJpegDimensions(buffer: Buffer): ImageDimensions | null {
	if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
		return null; // Not a JPEG (missing SOI marker)
	}

	let offset = 2;
	while (offset < buffer.length - 1) {
		// Find marker prefix
		if (buffer[offset] !== 0xff) {
			offset++;
			continue;
		}

		// Skip padding 0xFF bytes
		while (offset < buffer.length - 1 && buffer[offset + 1] === 0xff) {
			offset++;
		}
		if (offset >= buffer.length - 1) return null;

		const marker = buffer[offset + 1];

		// SOF markers (0xC0-0xCF) excluding DHT (0xC4) and reserved (0xC8)
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
			if (offset + 9 > buffer.length) return null;
			const height = buffer.readUInt16BE(offset + 5);
			const width = buffer.readUInt16BE(offset + 7);
			return { width, height };
		}

		// Skip non-SOF segments by reading segment length
		if (offset + 3 >= buffer.length) return null;
		const segmentLength = buffer.readUInt16BE(offset + 2);
		if (segmentLength < 2) return null; // Invalid segment length
		offset += 2 + segmentLength;
	}
	return null;
}

// --- SVG validation ---

/**
 * Validate that an SVG string has a valid <svg> root element.
 * Matches the Rust validator's approach: check for <svg> tag presence,
 * allowing an XML declaration or DOCTYPE before it.
 */
export function validateSvgStructure(svgText: string): boolean {
	return /<svg[\s>/]/i.test(svgText);
}

// --- Logo dimension orchestration ---

/**
 * Validate logo image dimensions and structure from base64 data.
 * PNG/JPEG: must be 100-400px and square.
 * SVG: must have valid <svg> root element.
 */
export function validateLogoDimensions(
	mimeType: string,
	base64Data: string,
	imageId: string
): ValidationError[] {
	const errors: ValidationError[] = [];

	let buffer: Buffer;
	try {
		buffer = Buffer.from(base64Data, 'base64');
	} catch {
		// Base64 validity is already checked by validateImages(), so this is defensive
		return errors;
	}

	if (mimeType === 'image/svg+xml') {
		const svgText = buffer.toString('utf-8');
		if (!validateSvgStructure(svgText)) {
			errors.push({
				category: 'Images',
				level: 'ERROR',
				message: `Logo ${imageId} is not a valid SVG file (missing <svg> root element)`
			});
		}
		return errors;
	}

	// PNG or JPEG
	let dimensions: ImageDimensions | null = null;
	if (mimeType === 'image/png') {
		dimensions = getPngDimensions(buffer);
	} else if (mimeType === 'image/jpeg') {
		dimensions = getJpegDimensions(buffer);
	}

	if (!dimensions) {
		errors.push({
			category: 'Images',
			level: 'ERROR',
			message: `Could not read dimensions for logo ${imageId}. File may be corrupted.`
		});
		return errors;
	}

	const { width, height } = dimensions;

	if (width !== height) {
		errors.push({
			category: 'Images',
			level: 'ERROR',
			message: `Logo ${imageId} is not square (${width}x${height}). Logo must be a square image.`
		});
	}

	if (width < LOGO_MIN_SIZE || height < LOGO_MIN_SIZE) {
		errors.push({
			category: 'Images',
			level: 'ERROR',
			message: `Logo ${imageId} is too small (${width}x${height}). Minimum size is ${LOGO_MIN_SIZE}x${LOGO_MIN_SIZE}.`
		});
	}

	if (width > LOGO_MAX_SIZE || height > LOGO_MAX_SIZE) {
		errors.push({
			category: 'Images',
			level: 'ERROR',
			message: `Logo ${imageId} is too large (${width}x${height}). Maximum size is ${LOGO_MAX_SIZE}x${LOGO_MAX_SIZE}.`
		});
	}

	return errors;
}
