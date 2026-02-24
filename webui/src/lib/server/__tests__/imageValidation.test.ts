import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import {
	getPngDimensions,
	getJpegDimensions,
	validateSvgStructure,
	validateLogoDimensions,
	LOGO_MIN_SIZE,
	LOGO_MAX_SIZE
} from '../imageValidation';

// --- Helpers to construct minimal image buffers ---

function createPngBuffer(width: number, height: number): Buffer {
	const buf = Buffer.alloc(24);
	// PNG signature
	buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	// IHDR chunk length (13 bytes)
	buf.writeUInt32BE(13, 8);
	// IHDR chunk type
	buf.set([0x49, 0x48, 0x44, 0x52], 12);
	// Width and height
	buf.writeUInt32BE(width, 16);
	buf.writeUInt32BE(height, 20);
	return buf;
}

function createJpegBuffer(width: number, height: number): Buffer {
	const buf = Buffer.alloc(11);
	// SOI marker
	buf[0] = 0xff;
	buf[1] = 0xd8;
	// SOF0 marker
	buf[2] = 0xff;
	buf[3] = 0xc0;
	// Segment length
	buf.writeUInt16BE(8, 4);
	// Precision
	buf[6] = 8;
	// Height and width
	buf.writeUInt16BE(height, 7);
	buf.writeUInt16BE(width, 9);
	return buf;
}

function svgToBase64(svgText: string): string {
	return Buffer.from(svgText, 'utf-8').toString('base64');
}

// --- Tests ---

describe('getPngDimensions', () => {
	it('reads dimensions from a valid PNG header', () => {
		const buf = createPngBuffer(200, 200);
		expect(getPngDimensions(buf)).toEqual({ width: 200, height: 200 });
	});

	it('reads non-square dimensions', () => {
		const buf = createPngBuffer(300, 150);
		expect(getPngDimensions(buf)).toEqual({ width: 300, height: 150 });
	});

	it('returns null for truncated buffer', () => {
		expect(getPngDimensions(Buffer.alloc(10))).toBeNull();
	});

	it('returns null for invalid signature', () => {
		const buf = createPngBuffer(200, 200);
		buf[0] = 0x00; // corrupt signature
		expect(getPngDimensions(buf)).toBeNull();
	});

	it('returns null for empty buffer', () => {
		expect(getPngDimensions(Buffer.alloc(0))).toBeNull();
	});
});

describe('getJpegDimensions', () => {
	it('reads dimensions from a valid JPEG with SOF0', () => {
		const buf = createJpegBuffer(200, 200);
		expect(getJpegDimensions(buf)).toEqual({ width: 200, height: 200 });
	});

	it('reads non-square JPEG dimensions', () => {
		const buf = createJpegBuffer(400, 300);
		expect(getJpegDimensions(buf)).toEqual({ width: 400, height: 300 });
	});

	it('reads dimensions from SOF2 (progressive JPEG)', () => {
		const buf = createJpegBuffer(250, 250);
		buf[3] = 0xc2; // SOF2 instead of SOF0
		expect(getJpegDimensions(buf)).toEqual({ width: 250, height: 250 });
	});

	it('skips padding 0xFF bytes', () => {
		// SOI + padding + SOF0
		const buf = Buffer.alloc(14);
		buf[0] = 0xff;
		buf[1] = 0xd8;
		// Extra 0xFF padding byte
		buf[2] = 0xff;
		buf[3] = 0xff;
		buf[4] = 0xc0; // SOF0
		buf.writeUInt16BE(8, 5); // segment length
		buf[7] = 8; // precision
		buf.writeUInt16BE(100, 8); // height
		buf.writeUInt16BE(100, 10); // width
		expect(getJpegDimensions(buf)).toEqual({ width: 100, height: 100 });
	});

	it('returns null for non-JPEG data', () => {
		expect(getJpegDimensions(Buffer.from([0x00, 0x00]))).toBeNull();
	});

	it('returns null for truncated JPEG', () => {
		const buf = Buffer.alloc(4);
		buf[0] = 0xff;
		buf[1] = 0xd8;
		buf[2] = 0xff;
		buf[3] = 0xc0;
		expect(getJpegDimensions(buf)).toBeNull();
	});

	it('returns null for empty buffer', () => {
		expect(getJpegDimensions(Buffer.alloc(0))).toBeNull();
	});

	it('skips DHT marker (0xC4) without treating it as SOF', () => {
		// SOI + DHT segment + SOF0
		const buf = Buffer.alloc(20);
		buf[0] = 0xff;
		buf[1] = 0xd8;
		// DHT marker
		buf[2] = 0xff;
		buf[3] = 0xc4;
		buf.writeUInt16BE(5, 4); // DHT segment length (5 bytes including length)
		// 3 bytes of DHT data
		buf[6] = 0x00;
		buf[7] = 0x00;
		buf[8] = 0x00;
		// SOF0 marker after DHT
		buf[9] = 0xff;
		buf[10] = 0xc0;
		buf.writeUInt16BE(8, 11); // segment length
		buf[13] = 8; // precision
		buf.writeUInt16BE(200, 14); // height
		buf.writeUInt16BE(200, 16); // width
		expect(getJpegDimensions(buf)).toEqual({ width: 200, height: 200 });
	});
});

describe('validateSvgStructure', () => {
	it('accepts valid SVG', () => {
		expect(validateSvgStructure('<svg width="100" height="100"></svg>')).toBe(true);
	});

	it('accepts SVG with XML declaration', () => {
		expect(
			validateSvgStructure('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')
		).toBe(true);
	});

	it('accepts SVG with DOCTYPE', () => {
		expect(
			validateSvgStructure(
				'<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg></svg>'
			)
		).toBe(true);
	});

	it('accepts self-closing SVG tag', () => {
		expect(validateSvgStructure('<svg/>')).toBe(true);
	});

	it('rejects empty string', () => {
		expect(validateSvgStructure('')).toBe(false);
	});

	it('rejects HTML without SVG', () => {
		expect(validateSvgStructure('<html><body>not svg</body></html>')).toBe(false);
	});

	it('rejects plain text', () => {
		expect(validateSvgStructure('just some text')).toBe(false);
	});
});

describe('validateLogoDimensions', () => {
	it('returns no errors for a valid square PNG', () => {
		const buf = createPngBuffer(200, 200);
		const base64 = buf.toString('base64');
		const errors = validateLogoDimensions('image/png', base64, 'test-logo');
		expect(errors).toHaveLength(0);
	});

	it('returns no errors for min-size PNG', () => {
		const buf = createPngBuffer(LOGO_MIN_SIZE, LOGO_MIN_SIZE);
		const base64 = buf.toString('base64');
		const errors = validateLogoDimensions('image/png', base64, 'test-logo');
		expect(errors).toHaveLength(0);
	});

	it('returns no errors for max-size PNG', () => {
		const buf = createPngBuffer(LOGO_MAX_SIZE, LOGO_MAX_SIZE);
		const base64 = buf.toString('base64');
		const errors = validateLogoDimensions('image/png', base64, 'test-logo');
		expect(errors).toHaveLength(0);
	});

	it('reports error for non-square PNG', () => {
		const buf = createPngBuffer(200, 300);
		const base64 = buf.toString('base64');
		const errors = validateLogoDimensions('image/png', base64, 'test-logo');
		expect(errors.some((e) => e.message.includes('not square'))).toBe(true);
	});

	it('reports error for too-small PNG', () => {
		const buf = createPngBuffer(50, 50);
		const base64 = buf.toString('base64');
		const errors = validateLogoDimensions('image/png', base64, 'test-logo');
		expect(errors.some((e) => e.message.includes('too small'))).toBe(true);
	});

	it('reports error for too-large PNG', () => {
		const buf = createPngBuffer(500, 500);
		const base64 = buf.toString('base64');
		const errors = validateLogoDimensions('image/png', base64, 'test-logo');
		expect(errors.some((e) => e.message.includes('too large'))).toBe(true);
	});

	it('reports error for corrupted PNG', () => {
		const base64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]).toString('base64');
		const errors = validateLogoDimensions('image/png', base64, 'test-logo');
		expect(errors.some((e) => e.message.includes('corrupted'))).toBe(true);
	});

	it('validates JPEG dimensions', () => {
		const buf = createJpegBuffer(200, 200);
		const base64 = buf.toString('base64');
		const errors = validateLogoDimensions('image/jpeg', base64, 'test-logo');
		expect(errors).toHaveLength(0);
	});

	it('reports error for non-square JPEG', () => {
		const buf = createJpegBuffer(200, 150);
		const base64 = buf.toString('base64');
		const errors = validateLogoDimensions('image/jpeg', base64, 'test-logo');
		expect(errors.some((e) => e.message.includes('not square'))).toBe(true);
	});

	it('returns no errors for valid SVG', () => {
		const base64 = svgToBase64('<svg width="100" height="100"></svg>');
		const errors = validateLogoDimensions('image/svg+xml', base64, 'test-logo');
		expect(errors).toHaveLength(0);
	});

	it('reports error for invalid SVG', () => {
		const base64 = svgToBase64('<html>not an svg</html>');
		const errors = validateLogoDimensions('image/svg+xml', base64, 'test-logo');
		expect(errors.some((e) => e.message.includes('missing <svg> root element'))).toBe(true);
	});

	it('all errors have category Images and level ERROR', () => {
		const buf = createPngBuffer(50, 80);
		const base64 = buf.toString('base64');
		const errors = validateLogoDimensions('image/png', base64, 'test-logo');
		expect(errors.length).toBeGreaterThan(0);
		for (const err of errors) {
			expect(err.category).toBe('Images');
			expect(err.level).toBe('ERROR');
		}
	});
});
