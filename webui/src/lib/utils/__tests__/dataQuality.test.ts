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
	findDuplicateName,
	containerMaterialOf,
	numberPattern,
	checkSourcedEntry,
	checkRecycledTrait,
	effectiveSustainability,
	findInvertedRanges,
	checkMechanicalEntry,
	findDuplicateMechanical
} from '../dataQuality';
import type { RecycledContent } from '$lib/types/database';

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

	it('finds the "NA" stand-in from #502, but not words containing it', () => {
		expect(checkPlaceholderEntries(['NA', 'CE', 'n/a'])).toEqual([0, 2]);
		expect(checkPlaceholderEntries(['NANO', 'UL 94'])).toEqual([]);
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

describe('findInvertedRanges', () => {
	// #767: min/max fan speed and drying temperature
	it('flags a min above its max', () => {
		expect(findInvertedRanges({ min_fan_speed: 80, max_fan_speed: 20 })).toEqual([
			{ low: 'min_fan_speed', high: 'max_fan_speed', lowValue: 80, highValue: 20 }
		]);
	});

	it('flags dry_temperature above max_dry_temperature', () => {
		expect(findInvertedRanges({ dry_temperature: 90, max_dry_temperature: 60 })).toHaveLength(1);
	});

	it('accepts equal or one-sided ranges', () => {
		expect(
			findInvertedRanges({ min_fan_speed: 50, max_fan_speed: 50, dry_temperature: 55 })
		).toEqual([]);
		expect(findInvertedRanges(null)).toEqual([]);
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

	it('keeps a spool that shares weight and diameter with its refill', () => {
		for (const refill of [{ container_material: 'refill' }, { spool_refill: true }]) {
			expect(
				findRedundantSizes([
					{ filament_weight: 1000, diameter: 1.75, ...refill },
					{ filament_weight: 1000, diameter: 1.75 }
				])
			).toEqual([]);
		}
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

// --- Sustainability data (mirrors the sustainability tests in test_data_quality.py) --

const SOURCE = {
	source_type: 'primary' as const,
	source_url: 'https://blog.prusa3d.com/introducing-prusament-petg-recycled/',
	retrieved: '2026-10-21'
};

function recycled(pct: number | null): RecycledContent {
	return {
		pct,
		type: 'post_industrial',
		evidence: 'supplier_declaration',
		...SOURCE,
		source_quote: 'made from 100% recycled material'
	};
}

describe('containerMaterialOf', () => {
	it('keeps mixed (cardboard core, plastic sides)', () => {
		expect(containerMaterialOf({ container_material: 'mixed' })).toBe('mixed');
	});
});

describe('numberPattern', () => {
	it.each([
		[5.85, 'The results show 5.85 kg of CO2', true],
		[5.85, '5,85 kg', true],
		[5.85, '15.85 kg', false],
		[5.85, '5.851 kg', false],
		[100, '100% recycled', true],
		[100, '1000 spools', false],
		[2.5, '2.50 kg', true],
		[7250, '7,250 psi', true],
		[7250, '7250 psi', true],
		[7250, '7 250 psi', true],
		[7250, '7\u00a0250 psi', true],
		[7250, '7\u202f250 psi', true],
		[7250, '7.250 psi', false],
		[7250, '17,250 psi', false],
		[1234.5, '1,234.5 MPa', true],
		[3860, '3860 ± 230 MPa', true]
	])('%s in %j -> %s', (value, quote, expected) => {
		expect(numberPattern(value).test(quote)).toBe(expected);
	});
});

describe('checkSourcedEntry', () => {
	const today = '2026-10-26';

	it('accepts a sourced footprint', () => {
		const entry = { value_kg_co2e: 5.85, ...SOURCE, source_quote: 'show 5.85 kg of CO2' };
		expect(checkSourcedEntry(entry, ['value_kg_co2e'], today)).toEqual([]);
	});

	it('flags a number missing from the quote', () => {
		const entry = { value_kg_co2e: 5.85, ...SOURCE, source_quote: 'about six kilograms' };
		const problems = checkSourcedEntry(entry, ['value_kg_co2e'], today);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('does not contain that number');
	});

	it('flags missing sources, out-of-range pct and future dates', () => {
		const entry = { pct: 120, source_quote: '120%', retrieved: '2999-01-01', reference_year: 2999 };
		const problems = checkSourcedEntry(entry, ['pct'], today);
		expect(problems.some((p) => p.startsWith('Missing source_url'))).toBe(true);
		expect(problems.some((p) => p.includes('between 0 and 100'))).toBe(true);
		expect(problems.filter((p) => p.includes('in the future'))).toHaveLength(2);
	});
});

describe('checkRecycledTrait', () => {
	it('errors when recycled pct > 0 but the trait is missing', () => {
		expect(checkRecycledTrait({ recycled_content: recycled(100) }, undefined, false)?.level).toBe(
			'error'
		);
	});

	it('lets a variant override replace the filament value', () => {
		expect(
			checkRecycledTrait({ recycled_content: recycled(100) }, { recycled_content: recycled(0) }, false)
		).toBeNull();
		expect(
			effectiveSustainability({ recycled_content: recycled(100) }, { recycled_content: recycled(0) })
				.recycled_content?.pct
		).toBe(0);
	});

	it('is silent for the trait alone until a sustainability block exists', () => {
		expect(checkRecycledTrait(undefined, undefined, true)).toBeNull();
		expect(checkRecycledTrait({ relative_claims: [] }, undefined, true)?.level).toBe('warning');
	});
});

describe('checkMechanicalEntry', () => {
	const today = '2026-11-09';
	// Bambu Lab PLA Basic TDS (store.bblcdn.com), the schema's own example.
	const modulus = {
		property: 'tensile_modulus',
		direction: 'XY',
		value: 3860,
		plus_minus: 230,
		unit: 'MPa',
		standard: 'ISO 527',
		condition: 'dry',
		specimen: { process: 'printed', infill_percent: 100 },
		source_type: 'primary',
		source_url: 'https://store.bblcdn.com/7166b20bc68f4c87b32c972b856eeb4b.pdf',
		source_quote: "Young's Modulus (X-Y) ISO 527, GB/T 1040 3860 ± 230 MPa",
		retrieved: '2026-11-08'
	};

	it('accepts a value and spread copied from the sheet', () => {
		expect(checkMechanicalEntry(modulus, today)).toEqual([]);
	});

	it('does not treat a modulus as a percentage', () => {
		const issues = checkMechanicalEntry(modulus, today);
		expect(issues.some((i) => i.message.includes('between 0 and 100'))).toBe(false);
	});

	it('flags missing sources and a future retrieved date', () => {
		const issues = checkMechanicalEntry(
			{ ...modulus, source_url: ' ', retrieved: '2999-01-01' },
			today
		);
		expect(issues.every((i) => i.level === 'error')).toBe(true);
		expect(issues.some((i) => i.message.startsWith('Missing source_url'))).toBe(true);
		expect(issues.some((i) => i.message.includes('in the future'))).toBe(true);
	});

	it('flags a malformed retrieved date', () => {
		const issues = checkMechanicalEntry({ ...modulus, retrieved: '08/11/2026' }, today);
		expect(issues.some((i) => i.message.includes('YYYY-MM-DD'))).toBe(true);
	});

	it('flags a value or spread missing from the quote, e.g. a converted figure', () => {
		const converted = checkMechanicalEntry({ ...modulus, value: 3.86, unit: 'GPa' }, today);
		expect(converted.filter((i) => i.message.includes('does not contain'))).toHaveLength(1);
		const spread = checkMechanicalEntry({ ...modulus, plus_minus: 23 }, today);
		expect(spread.some((i) => i.message.startsWith('plus_minus is 23'))).toBe(true);
		// No spread published: nothing to look for.
		expect(checkMechanicalEntry({ ...modulus, plus_minus: null }, today)).toEqual([]);
	});

	it('flags a unit that does not fit the property', () => {
		const issues = checkMechanicalEntry(
			{ ...modulus, property: 'elongation_at_break', value: 3860, unit: 'MPa' },
			today
		);
		expect(issues).toEqual([
			{ level: 'error', message: 'MPa is not a unit for elongation_at_break; use %.' }
		]);
		const hdt = {
			...modulus,
			property: 'heat_deflection_045',
			value: 57,
			plus_minus: null,
			unit: '°C',
			source_quote: 'Heat Deflection Temperature (0.45 MPa) ISO 75 57 °C'
		};
		expect(checkMechanicalEntry(hdt, today)).toEqual([]);
	});

	it('warns when moulded bars carry a print direction', () => {
		const issues = checkMechanicalEntry({ ...modulus, specimen: { process: 'moulded' } }, today);
		expect(issues).toHaveLength(1);
		expect(issues[0].level).toBe('warning');
		const moulded = { ...modulus, direction: 'unknown', specimen: { process: 'moulded' } };
		expect(checkMechanicalEntry(moulded, today)).toEqual([]);
	});
});

describe('findDuplicateMechanical', () => {
	const base = { property: 'tensile_strength', direction: 'XY', unit: 'MPa', standard: 'ISO 527' };

	it('maps a repeat to the first entry', () => {
		const dups = findDuplicateMechanical([base, { ...base, direction: 'Z' }, { ...base }]);
		expect([...dups]).toEqual([[2, 0]]);
	});

	it('tells entries apart by condition, standard and unit', () => {
		expect(
			findDuplicateMechanical([
				base,
				{ ...base, condition: 'conditioned' },
				{ ...base, standard: 'ASTM D638' },
				{ ...base, unit: 'psi' }
			]).size
		).toBe(0);
	});

	it('treats a blank standard as no standard', () => {
		const dups = findDuplicateMechanical([
			{ ...base, standard: undefined },
			{ ...base, standard: null },
			{ ...base, standard: ' ' }
		]);
		expect([...dups]).toEqual([
			[1, 0],
			[2, 0]
		]);
	});
});
