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
	checkNameLeadingCase,
	checkPlaceholderEntries,
	findSharedPurchaseLinks,
	suggestTraitsFromSiblings,
	findRedundantSizes,
	findDuplicateName
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

describe('suggestTraitsFromSiblings', () => {
	// PR #496: a variant added under kingroon/PLA/silk_pla/ without traits.silk, when
	// every other colour in that line declares it. A reviewer wrote that by hand.
	it('suggests a trait every sibling carries', () => {
		expect(
			suggestTraitsFromSiblings(
				[['silk'], ['silk'], ['silk', 'glitter']],
				new Set<string>()
			)
		).toEqual(['silk']);
	});

	it('ignores traits only some siblings carry', () => {
		expect(
			suggestTraitsFromSiblings([['silk', 'glitter'], ['silk'], ['silk']], new Set<string>())
		).toEqual(['silk']);
	});

	it('does not re-suggest what the variant already has', () => {
		expect(
			suggestTraitsFromSiblings([['silk'], ['silk']], new Set(['silk']))
		).toEqual([]);
	});

	it('suggests every unanimous trait, in first-seen order', () => {
		expect(
			suggestTraitsFromSiblings(
				[
					['industrially_compostable', 'silk'],
					['silk', 'industrially_compostable'],
					['silk', 'industrially_compostable', 'glitter']
				],
				new Set<string>()
			)
		).toEqual(['industrially_compostable', 'silk']);
	});

	it('needs a quorum: one sibling is not a consensus', () => {
		expect(suggestTraitsFromSiblings([['silk']], new Set<string>())).toEqual([]);
		expect(suggestTraitsFromSiblings([], new Set<string>())).toEqual([]);
		// ...unless the caller lowers the bar deliberately.
		expect(suggestTraitsFromSiblings([['silk']], new Set<string>(), 1)).toEqual(['silk']);
	});

	it('says nothing when a sibling has no traits at all', () => {
		expect(suggestTraitsFromSiblings([['silk'], []], new Set<string>())).toEqual([]);
	});
});

describe('checkNameLeadingCase', () => {
	it('capitalises a name that starts lowercase', () => {
		expect(checkNameLeadingCase('yellow')).toEqual({ suggestion: 'Yellow' });
		expect(checkNameLeadingCase('glass fiber black')).toEqual({
			suggestion: 'Glass fiber black'
		});
	});

	it('only touches the first letter', () => {
		// Title-casing the rest would rewrite the manufacturer's own styling.
		expect(checkNameLeadingCase('easy PETG')).toEqual({ suggestion: 'Easy PETG' });
	});

	it('leaves intercapped brand styling alone', () => {
		for (const name of ['eSUN 3D', 'iSANMATE', 'rPLA pro', 'rPETG', 'ePAHT-CF']) {
			expect(checkNameLeadingCase(name)).toBeNull();
		}
	});

	it('leaves an already-capitalised non-ASCII name alone', () => {
		// data/ambrosia/ABS/uber is really named "Über ABS". Treating Ü as a
		// non-letter would find the "b" and "fix" the name into "ÜBer ABS".
		expect(checkNameLeadingCase('Über ABS')).toBeNull();
		expect(checkNameLeadingCase('Ökofil')).toBeNull();
		expect(checkNameLeadingCase('Éclat Silk')).toBeNull();
	});

	it('still nudges a genuinely lowercase non-ASCII name', () => {
		expect(checkNameLeadingCase('über abs')).toEqual({ suggestion: 'Über abs' });
	});

	it('treats a caseless leading character as no evidence either way', () => {
		expect(checkNameLeadingCase('東京 Black')).toBeNull();
	});

	it('skips over a leading digit or symbol to find the first letter', () => {
		expect(checkNameLeadingCase('3d gold')).toEqual({ suggestion: '3D gold' });
		expect(checkNameLeadingCase('3D Gold')).toBeNull();
	});

	it('says nothing about an already-capitalised or letterless name', () => {
		expect(checkNameLeadingCase('Galaxy Black')).toBeNull();
		expect(checkNameLeadingCase('PLA+')).toBeNull();
		expect(checkNameLeadingCase('1.75')).toBeNull();
		expect(checkNameLeadingCase('')).toBeNull();
	});
});

describe('findSharedPurchaseLinks', () => {
	const variant = (id: string, name: string, ...urls: string[]) => ({
		id,
		slug: id,
		name,
		sizes: [{ purchase_links: urls.map((url) => ({ url })) }]
	});
	const GENERIC = 'https://shop.example/hyper-petg';

	it('reports a URL shared by three or more colours, with who shares it', () => {
		expect(
			findSharedPurchaseLinks([
				variant('black', 'Black', GENERIC),
				variant('blue', 'Blue', GENERIC),
				variant('green', 'Green', GENERIC)
			])
		).toEqual([
			{
				url: GENERIC,
				variantIds: ['black', 'blue', 'green'],
				variantNames: ['Black', 'Blue', 'Green']
			}
		]);
	});

	it('stays quiet below the threshold', () => {
		expect(
			findSharedPurchaseLinks([variant('black', 'Black', GENERIC), variant('blue', 'Blue', GENERIC)])
		).toEqual([]);
	});

	it('counts a colour once however many spool sizes repeat the link', () => {
		const black = {
			id: 'black',
			slug: 'black',
			name: 'Black',
			sizes: [{ purchase_links: [{ url: GENERIC }] }, { purchase_links: [{ url: GENERIC }] }]
		};
		expect(findSharedPurchaseLinks([black])).toEqual([]);
	});

	it('leaves colour-specific links alone', () => {
		expect(
			findSharedPurchaseLinks([
				variant('black', 'Black', `${GENERIC}-black`),
				variant('blue', 'Blue', `${GENERIC}-blue`),
				variant('green', 'Green', `${GENERIC}-green`)
			])
		).toEqual([]);
	});

	it('survives missing sizes, links, urls and ids', () => {
		expect(
			findSharedPurchaseLinks([
				{ id: 'a', name: 'A' },
				{ id: 'b', name: 'B', sizes: null },
				{ id: 'c', name: 'C', sizes: [null] },
				{ id: 'd', name: 'D', sizes: [{ purchase_links: [{ url: undefined }] }] },
				{ name: 'no id', sizes: [{ purchase_links: [{ url: GENERIC }] }] }
			])
		).toEqual([]);
	});

	it('honours a custom threshold', () => {
		expect(
			findSharedPurchaseLinks(
				[variant('black', 'Black', GENERIC), variant('blue', 'Blue', GENERIC)],
				2
			)
		).toHaveLength(1);
	});
});


describe('findDuplicateName', () => {
	const existing = [
		{ name: 'PLA Matte', slug: 'pla_matte', materialType: 'PLA' },
		{ name: 'PLA CF', slug: 'pla_cf', materialType: 'PLA' },
		{ name: 'Silk', slug: 'silk', materialType: 'PLA' }
	];

	it('flags a name already used elsewhere in the brand (#280)', () => {
		// The PLA-CF that snuck into PETG beside the real one.
		expect(findDuplicateName('PLA CF', existing)).toEqual({
			match: existing[1],
			kind: 'exact'
		});
	});

	it('matches on the folder id, so punctuation does not hide a clash', () => {
		expect(findDuplicateName('PLA-CF', existing)?.kind).toBe('exact');
		expect(findDuplicateName('pla cf', existing)?.kind).toBe('exact');
	});

	it('flags a word-order duplicate', () => {
		expect(findDuplicateName('CF PLA', existing)).toEqual({
			match: existing[1],
			kind: 'word-order'
		});
	});

	it('prefers an exact match over a word-order one', () => {
		const entries = [
			{ name: 'CF PLA', slug: 'cf_pla' },
			{ name: 'PLA CF', slug: 'pla_cf' }
		];
		expect(findDuplicateName('PLA CF', entries)).toEqual({ match: entries[1], kind: 'exact' });
	});

	it('stays silent on a distinct name', () => {
		expect(findDuplicateName('PLA HF', existing)).toBeNull();
	});

	it('falls back to the name when no slug is recorded', () => {
		expect(findDuplicateName('Silk', [{ name: 'Silk' }])?.kind).toBe('exact');
	});

	it('says nothing about an empty or punctuation-only name', () => {
		expect(findDuplicateName('', existing)).toBeNull();
		expect(findDuplicateName('  ', existing)).toBeNull();
		expect(findDuplicateName('Silk', [{ name: '' }, { name: '---' }])).toBeNull();
	});
});
