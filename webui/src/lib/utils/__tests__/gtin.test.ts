import { describe, it, expect } from 'vitest';
import { normalizeGtin, looksLikeBarcode } from '../gtin';

// Mirrors tests/test_gtin_index_exporter.py — the exporter keys the index with the
// Python normalizer, so a query normalized differently here would never match.
describe('normalizeGtin', () => {
	it('collapses UPC-A, EAN-13 and GTIN-14 for one product to a single key', () => {
		expect(normalizeGtin('012345678905')).toBe('00012345678905');
		expect(normalizeGtin('0012345678905')).toBe('00012345678905');
		expect(normalizeGtin('00012345678905')).toBe('00012345678905');
	});

	it('tolerates the separators real data carries', () => {
		expect(normalizeGtin('0 12345 67890 5')).toBe(normalizeGtin('012345678905'));
		expect(normalizeGtin('6938936-710103')).toBe(normalizeGtin('6938936710103'));
	});

	it('rejects rather than pads anything that is not a GTIN', () => {
		// Padding a truncated or free-text value to 14 would collide with a real code.
		for (const value of [null, undefined, '', '   ', 'abc', '123', '1234567', '123456789012345']) {
			expect(normalizeGtin(value)).toBeNull();
		}
	});
});

describe('looksLikeBarcode', () => {
	it('accepts digit strings of GTIN length, with or without separators', () => {
		expect(looksLikeBarcode('6938936710103')).toBe(true);
		expect(looksLikeBarcode('  0 12345 67890 5 ')).toBe(true);
		expect(looksLikeBarcode('12345678')).toBe(true);
	});

	it('rejects anything a name search should own', () => {
		// The barcode index is a few hundred KB; a name search must never fetch it.
		expect(looksLikeBarcode('hyper petg')).toBe(false);
		expect(looksLikeBarcode('850')).toBe(false);
		expect(looksLikeBarcode('1.75')).toBe(false);
		expect(looksLikeBarcode('pla 12345678')).toBe(false);
		expect(looksLikeBarcode('')).toBe(false);
	});
});
