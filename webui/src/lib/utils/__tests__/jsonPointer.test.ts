import { describe, it, expect } from 'vitest';
import {
	childPointer,
	parsePointer,
	updateAtPointer,
	valueAtPointer
} from '$lib/utils/jsonPointer';

describe('jsonPointer', () => {
	const data = {
		name: 'Grey',
		sizes: [{ purchase_links: [{ url: 'a' }, { url: 'b' }] }],
		'a/b': 1
	};

	it('reads and builds pointers', () => {
		expect(valueAtPointer(data, '/sizes/0/purchase_links/1/url')).toBe('b');
		expect(valueAtPointer(data, '/a~1b')).toBe(1);
		expect(valueAtPointer(data, '/missing/x')).toBeUndefined();
		expect(childPointer('/sizes', 0)).toBe('/sizes/0');
		expect(childPointer('', 'a/b')).toBe('/a~1b');
		expect(parsePointer('')).toEqual([]);
	});

	it('replaces a value without touching the original', () => {
		const next = updateAtPointer(data, '/sizes/0/purchase_links/1/url', 'c');
		expect(next.sizes[0].purchase_links[1].url).toBe('c');
		expect(data.sizes[0].purchase_links[1].url).toBe('b');
		// Untouched branches are shared, touched ones copied.
		expect(next.sizes[0].purchase_links[0]).toBe(data.sizes[0].purchase_links[0]);
		expect(next.sizes).not.toBe(data.sizes);
	});

	it('removes keys and splices array elements', () => {
		expect(updateAtPointer(data, '/name', undefined, true)).not.toHaveProperty('name');
		expect(
			updateAtPointer(data, '/sizes/0/purchase_links/0', undefined, true).sizes[0].purchase_links
		).toEqual([{ url: 'b' }]);
	});

	it('creates missing containers', () => {
		expect(updateAtPointer({}, '/traits/glitter', true)).toEqual({ traits: { glitter: true } });
		expect(updateAtPointer({}, '/sizes/0', { w: 1 })).toEqual({ sizes: [{ w: 1 }] });
	});
});
