/**
 * Tests for the logoManagement utility.
 *
 * Covers the public helpers that parse data URLs for logo upload and the
 * saveLogoImage flow that writes through the change store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const storeImageMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/stores/changes', () => ({
	changeStore: { storeImage: storeImageMock }
}));

import {
	getLogoFilename,
	getMimeType,
	extractBase64,
	saveLogoImage
} from '../logoManagement';

describe('logoManagement', () => {
	beforeEach(() => {
		storeImageMock.mockReset();
	});

	describe('getLogoFilename', () => {
		it('returns logo.png for a PNG data URL', () => {
			expect(getLogoFilename('data:image/png;base64,iVBORw==')).toBe('logo.png');
		});

		it('returns logo.jpeg for a JPEG data URL', () => {
			expect(getLogoFilename('data:image/jpeg;base64,/9j/4AA=')).toBe('logo.jpeg');
		});

		it('returns logo.svg (not svg+xml) for an SVG data URL', () => {
			expect(getLogoFilename('data:image/svg+xml;base64,PHN2Zw==')).toBe('logo.svg');
		});

		it('returns logo.webp for a WebP data URL', () => {
			expect(getLogoFilename('data:image/webp;base64,UklGR==')).toBe('logo.webp');
		});

		it('falls back to logo.png for a malformed data URL', () => {
			expect(getLogoFilename('not-a-data-url')).toBe('logo.png');
			expect(getLogoFilename('')).toBe('logo.png');
			expect(getLogoFilename('data:text/plain;base64,XXX')).toBe('logo.png');
		});
	});

	describe('getMimeType', () => {
		it('extracts image/png', () => {
			expect(getMimeType('data:image/png;base64,iVBORw==')).toBe('image/png');
		});

		it('extracts image/svg+xml verbatim', () => {
			expect(getMimeType('data:image/svg+xml;base64,PHN2Zw==')).toBe('image/svg+xml');
		});

		it('extracts image/jpeg', () => {
			expect(getMimeType('data:image/jpeg;base64,/9j/4AA=')).toBe('image/jpeg');
		});

		it('falls back to image/png on malformed input', () => {
			expect(getMimeType('not-a-data-url')).toBe('image/png');
			expect(getMimeType('data:text/plain;base64,XXX')).toBe('image/png');
		});
	});

	describe('extractBase64', () => {
		it('strips the data URL prefix and returns the encoded data', () => {
			expect(extractBase64('data:image/png;base64,iVBORw==')).toBe('iVBORw==');
		});

		it('handles long base64 strings with line breaks present', () => {
			const longData = 'iVBORw0KGgoAAAANSUhEUgAAAA==';
			expect(extractBase64(`data:image/png;base64,${longData}`)).toBe(longData);
		});

		it('returns input unchanged when no base64 marker is present', () => {
			expect(extractBase64('not-a-data-url')).toBe('not-a-data-url');
		});

		it('returns input unchanged when prefix is missing but marker matches', () => {
			expect(extractBase64('whatever;base64,XYZ')).toBe('whatever;base64,XYZ');
		});

		it('handles empty data URL gracefully', () => {
			expect(extractBase64('data:image/png;base64,')).toBe('');
		});
	});

	describe('saveLogoImage', () => {
		const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';

		it('stores a brand logo with correct path and filename', async () => {
			storeImageMock.mockResolvedValue(undefined);

			const imageId = await saveLogoImage('acme', dataUrl, 'brand');

			expect(imageId).toBeTruthy();
			expect(imageId!.startsWith('brand_acme_logo_')).toBe(true);
			expect(storeImageMock).toHaveBeenCalledTimes(1);

			const [id, entityPath, prop, filename, mime, base64] = storeImageMock.mock.calls[0];
			expect(id).toBe(imageId);
			expect(entityPath).toBe('brands/acme');
			expect(prop).toBe('logo');
			expect(filename).toBe('logo.png');
			expect(mime).toBe('image/png');
			expect(base64).toBe('iVBORw0KGgo=');
		});

		it('stores a store logo under the stores/ path', async () => {
			storeImageMock.mockResolvedValue(undefined);
			const svgDataUrl = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';

			const imageId = await saveLogoImage('shop', svgDataUrl, 'store');

			expect(imageId).toBeTruthy();
			expect(imageId!.startsWith('store_shop_logo_')).toBe(true);

			const [, entityPath, prop, filename, mime] = storeImageMock.mock.calls[0];
			expect(entityPath).toBe('stores/shop');
			expect(prop).toBe('logo');
			expect(filename).toBe('logo.svg');
			expect(mime).toBe('image/svg+xml');
		});

		it('image IDs are unique across calls (timestamp-based)', async () => {
			storeImageMock.mockResolvedValue(undefined);

			const id1 = await saveLogoImage('acme', dataUrl, 'brand');
			// Force a microtask gap so Date.now() advances
			await new Promise((r) => setTimeout(r, 2));
			const id2 = await saveLogoImage('acme', dataUrl, 'brand');

			expect(id1).not.toBe(id2);
		});

		it('returns null and logs when storeImage rejects', async () => {
			storeImageMock.mockRejectedValueOnce(new Error('IndexedDB failed'));
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const result = await saveLogoImage('acme', dataUrl, 'brand');

			expect(result).toBeNull();
			expect(errSpy).toHaveBeenCalled();
			errSpy.mockRestore();
		});
	});
});
