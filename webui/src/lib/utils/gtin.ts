/**
 * Barcode normalization, mirrored from `normalize_gtin` in `ofd/builder/utils.py`.
 *
 * UPC-A (12 digits), EAN-13 and GTIN-14 are the same number written at different
 * widths — a UPC-A scanned off a spool is its EAN-13 with a leading zero. Padding
 * everything to 14 makes those three spellings one lookup key, which is what lets
 * someone scan a barcode and find the variant without knowing which width the
 * contributor happened to type (#479).
 *
 * The build-time exporter keys `gtin-index.json` this way, so a query must be
 * normalized the same way before looking it up. Keep the two in lockstep.
 */

/** Normalize a barcode to its 14-digit GTIN form, or `null` if it isn't one. */
export function normalizeGtin(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	// Separators are tolerated: real data carries them ("0 12345 67890 5").
	const digits = String(value).replace(/\D/g, '');
	// GTIN-8 is the shortest legal form; longer than 14 is not a GTIN at all. A
	// truncated or free-text value padded to 14 would collide with a real code.
	if (digits.length < 8 || digits.length > 14) return null;
	return digits.padStart(14, '0');
}

/**
 * Whether a search query should be treated as a barcode.
 *
 * Deliberately strict — only digits and separators. Anything else is a name search,
 * and the barcode index (a few hundred KB) is never fetched for one.
 */
export function looksLikeBarcode(query: string): boolean {
	const trimmed = query.trim();
	if (!trimmed || !/^[\d\s-]+$/.test(trimmed)) return false;
	return normalizeGtin(trimmed) !== null;
}
