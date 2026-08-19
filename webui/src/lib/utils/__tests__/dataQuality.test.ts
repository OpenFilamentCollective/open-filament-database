/**
 * Mirrors `tests/test_data_quality.py`. Each case is anchored to the submission that
 * motivated the rule, so a regression traces back to the review comment it exists to
 * make unnecessary.
 */
import { describe, it, expect } from 'vitest';
import {
	isTitleCased,
	toTitleCase,
	checkNameCasing,
	checkNameWhitespace,
	checkPlaceholderEntries,
	findRedundantSizes
} from '../dataQuality';

describe('isTitleCased', () => {
	it('accepts a title-cased name', () => {
		expect(isTitleCased('Sky Blue')).toBe(true);
		expect(isTitleCased('Black')).toBe(true);
	});

	it('ignores minor words', () => {
		expect(isTitleCased('Black and White')).toBe(true);
	});

	it('rejects a lowercase name', () => {
		expect(isTitleCased('translucent blue')).toBe(false);
	});

	it('is false for a name with no letters', () => {
		expect(isTitleCased('#1')).toBe(false);
		expect(isTitleCased('')).toBe(false);
	});
});

describe('toTitleCase', () => {
	it('capitalises each significant word', () => {
		expect(toTitleCase('true red')).toBe('True Red');
		expect(toTitleCase('carbon fiber blue')).toBe('Carbon Fiber Blue');
	});

	it('leaves minor words alone except at the start', () => {
		expect(toTitleCase('black and white')).toBe('Black and White');
		expect(toTitleCase('the black')).toBe('The Black');
	});

	it('preserves existing capitals and internal punctuation', () => {
		expect(toTitleCase('PLA silk')).toBe('PLA Silk');
		expect(toTitleCase("robin's egg")).toBe("Robin's Egg");
	});

	it('preserves the original spacing', () => {
		expect(toTitleCase('sky  blue')).toBe('Sky  Blue');
	});
});

describe('checkNameCasing', () => {
	it('flags a lowercase name among Title Case siblings — the #451 case', () => {
		const issue = checkNameCasing('translucent blue', ['Purple', 'Transparent']);
		expect(issue).toEqual({ suggestion: 'Translucent Blue', example: 'Purple' });
	});

	it('flags the #452 case', () => {
		expect(checkNameCasing('true red', ['Red', 'Mint Green'])?.suggestion).toBe('True Red');
	});

	it('says nothing when no sibling establishes Title Case', () => {
		expect(checkNameCasing('black', ['blue', 'red'])).toBeNull();
	});

	it('says nothing when there are no siblings at all', () => {
		expect(checkNameCasing('black', [])).toBeNull();
	});

	it('says nothing about an already title-cased name', () => {
		expect(checkNameCasing('Sky Blue', ['Purple'])).toBeNull();
	});

	it('does not treat the name itself as its own Title Case sibling', () => {
		expect(checkNameCasing('black', ['black'])).toBeNull();
	});
});

describe('checkNameWhitespace', () => {
	it('flags the trailing space that shipped in #460', () => {
		expect(checkNameWhitespace('Silk ')).toEqual({
			suggestion: 'Silk',
			reason: 'has leading or trailing whitespace'
		});
	});

	it('flags repeated internal whitespace', () => {
		expect(checkNameWhitespace('Sky  Blue')?.suggestion).toBe('Sky Blue');
		expect(checkNameWhitespace('Sky  Blue')?.reason).toBe('contains repeated whitespace');
	});

	it('accepts a clean name', () => {
		expect(checkNameWhitespace('Sky Blue')).toBeNull();
		expect(checkNameWhitespace('')).toBeNull();
	});
});

describe('checkPlaceholderEntries', () => {
	it('finds the empty certification string from #453', () => {
		expect(checkPlaceholderEntries([''])).toEqual([0]);
		expect(checkPlaceholderEntries(['CE', '', 'RoHS'])).toEqual([1]);
	});

	it('treats a whitespace-only entry as empty', () => {
		expect(checkPlaceholderEntries(['  '])).toEqual([0]);
	});

	it('says nothing about a populated or empty array', () => {
		expect(checkPlaceholderEntries(['CE'])).toEqual([]);
		expect(checkPlaceholderEntries([])).toEqual([]);
	});

	it('is safe on a non-array', () => {
		expect(checkPlaceholderEntries(undefined)).toEqual([]);
		expect(checkPlaceholderEntries('CE')).toEqual([]);
	});
});

describe('findRedundantSizes', () => {
	it('flags two identical rows — the #453 case', () => {
		expect(
			findRedundantSizes([
				{ filament_weight: 1000, diameter: 1.75 },
				{ filament_weight: 1000, diameter: 1.75 }
			])
		).toEqual([{ index: 1, duplicateOf: 0 }]);
	});

	it('flags a row that only omits fields — the polylite / sunlu shape', () => {
		expect(
			findRedundantSizes([
				{ filament_weight: 5000, diameter: 1.75, empty_spool_weight: 819 },
				{ filament_weight: 5000, diameter: 1.75 }
			])
		).toEqual([{ index: 1, duplicateOf: 0 }]);
	});

	it('keeps rows distinguished by a GTIN', () => {
		expect(
			findRedundantSizes([
				{ filament_weight: 1000, diameter: 1.75, gtin: '012345678905' },
				{ filament_weight: 1000, diameter: 1.75, gtin: '012345678912' }
			])
		).toEqual([]);
	});

	it('keeps rows distinguished by a purchase link', () => {
		expect(
			findRedundantSizes([
				{ filament_weight: 1000, diameter: 1.75, purchase_links: [{ url: 'a' }] },
				{ filament_weight: 1000, diameter: 1.75, purchase_links: [{ url: 'b' }] }
			])
		).toEqual([]);
	});

	it('does not treat different diameters as duplicates', () => {
		expect(
			findRedundantSizes([
				{ filament_weight: 1000, diameter: 1.75 },
				{ filament_weight: 1000, diameter: 2.85 }
			])
		).toEqual([]);
	});

	it('ignores uuid when comparing — every real duplicate has its own', () => {
		expect(
			findRedundantSizes([
				{ uuid: 'a', filament_weight: 1000, diameter: 1.75 },
				{ uuid: 'b', filament_weight: 1000, diameter: 1.75 }
			])
		).toEqual([{ index: 1, duplicateOf: 0 }]);
	});

	it('ignores empty-string fields, which the form leaves behind', () => {
		expect(
			findRedundantSizes([
				{ filament_weight: 1000, diameter: 1.75 },
				{ filament_weight: 1000, diameter: 1.75, article_number: '' }
			])
		).toEqual([{ index: 1, duplicateOf: 0 }]);
	});

	it('reports each redundant row once, against the row it duplicates', () => {
		expect(
			findRedundantSizes([
				{ filament_weight: 1000, diameter: 1.75 },
				{ filament_weight: 1000, diameter: 1.75 },
				{ filament_weight: 1000, diameter: 1.75 }
			])
		).toEqual([
			{ index: 1, duplicateOf: 0 },
			{ index: 2, duplicateOf: 0 }
		]);
	});

	it('is empty for a single row', () => {
		expect(findRedundantSizes([{ filament_weight: 1000, diameter: 1.75 }])).toEqual([]);
		expect(findRedundantSizes([])).toEqual([]);
	});
});
