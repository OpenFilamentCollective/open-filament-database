import { describe, expect, it } from 'vitest';
import { websiteList } from '../websites';

describe('websiteList', () => {
	it('reads a single URL', () => {
		expect(websiteList({ website: 'https://a.com' })).toEqual(['https://a.com']);
	});

	it('reads a list from brand.json', () => {
		expect(websiteList({ website: ['https://a.com', 'https://b.com'] })).toEqual([
			'https://a.com',
			'https://b.com'
		]);
	});

	it('prefers the full list from the built dataset', () => {
		expect(websiteList({ website: 'https://a.com', websites: ['https://a.com', 'https://b.com'] })).toEqual([
			'https://a.com',
			'https://b.com'
		]);
	});

	it('is empty when there is no site', () => {
		expect(websiteList({ website: '' })).toEqual([]);
		expect(websiteList(undefined)).toEqual([]);
	});
});
