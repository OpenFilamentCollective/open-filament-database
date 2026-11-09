/**
 * Data-quality checks, mirrored from `ofd/validation/data_quality.py`.
 *
 * These are the small, repetitive defects reviewers kept fixing by hand on webui
 * submissions after PR #405 — lowercase colour names among Title Case siblings (#451,
 * #452), placeholder empty strings (#453), spool rows that duplicate an earlier row
 * (#453), names with stray whitespace (#460). The Python module is the authority and
 * runs in CI; this file is what turns each rule into an inline "Fix" hint at entry
 * time, so a contributor never has to be told in review. Keep the two in lockstep.
 *
 * Every check is pure and returns `null` when there is nothing to say, so a form can
 * render it as `{#if issue}`. None of them mutate the value — the caller applies the
 * suggested fix only when the user presses the button.
 *
 * Name-derived trait detection is not repeated here: `traitSuggestions.ts` reads the
 * shared `schemas/trait_rules.json` table (via `/api/trait-rules`) and is wired into `VariantForm`.
 */

import type { ContainerMaterial, Sustainability } from '$lib/types/database';

/** Words that legitimately stay lowercase inside a title-cased display name. */
const MINOR_WORDS = new Set([
	'and',
	'of',
	'the',
	'with',
	'de',
	'w/',
	'in',
	'on',
	'for',
	'a',
	'an'
]);

/** True when every significant word starts with an uppercase letter. */
export function isTitleCased(name: string): boolean {
	const words = name.split(/\s+/).filter((w) => w && /[a-zA-Z]/.test(w[0]));
	if (words.length === 0) return false;
	return words.every((w) => MINOR_WORDS.has(w.toLowerCase()) || w[0] === w[0].toUpperCase());
}

function isAllLower(name: string): boolean {
	return !!name && name === name.toLowerCase() && /[a-zA-Z]/.test(name);
}

/** Title-case a display name, leaving minor words and existing capitals alone. */
export function toTitleCase(name: string): string {
	return name
		.split(/(\s+)/)
		.map((token, index) => {
			if (!token.trim()) return token;
			// The first word is capitalised even when it is a minor word.
			if (index > 0 && MINOR_WORDS.has(token.toLowerCase())) return token;
			return token[0].toUpperCase() + token.slice(1);
		})
		.join('');
}

/**
 * A lowercase name among Title Case siblings.
 *
 * Casing is house style rather than a hard rule, so this only fires when the entity's
 * own siblings establish the convention — exactly how it was caught by hand on #451
 * ("translucent blue" beside "Purple", "Transparent") and #452 ("true red" beside
 * "Red", "Mint Green"). Returns the suggested replacement and an example sibling.
 */
export function checkNameCasing(
	name: string,
	siblingNames: string[]
): { suggestion: string; example: string } | null {
	if (!isAllLower(name)) return null;
	const example = siblingNames.find((s) => s && s !== name && isTitleCased(s));
	if (!example) return null;
	const suggestion = toTitleCase(name);
	if (suggestion === name) return null;
	return { suggestion, example };
}

/**
 * Whether a character is a lowercase *cased* letter — the JS equivalent of Python's
 * `str.islower()`. A caseless character (a digit, CJK, punctuation) is neither.
 */
function isLowerCased(ch: string): boolean {
	return ch === ch.toLowerCase() && ch !== ch.toUpperCase();
}

/** As {@link isLowerCased}, for uppercase (Python's `str.isupper()`). */
function isUpperCased(ch: string): boolean {
	return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

/**
 * A display name that starts with a lowercase letter.
 *
 * Narrower and more certain than {@link checkNameCasing}: that one needs Title Case
 * siblings to establish a convention, so it stays silent on the first colour of a new
 * filament — which is exactly when a name typed straight off a product page ("yellow",
 * "glass fiber black", "kexcelled") lands in the tree. 126 names in the current data
 * start lowercase this way.
 *
 * A leading capital is not house style, it is how the field is read everywhere it is
 * displayed, so this fires on its own. Only the first letter is changed: Title Casing
 * the rest would mangle manufacturer names like "PLA+ eSilk".
 *
 * Deliberately silent on intercapped names — `eSUN 3D`, `iSANMATE`, `rPLA pro`,
 * `rPETG`, `ePAHT-CF`. A lowercase letter immediately followed by an uppercase one is
 * a brand's own styling, and there are 18 of them in the tree that must be left alone.
 */
export function checkNameLeadingCase(name: string): { suggestion: string } | null {
	if (!name) return null;
	// Find the first letter; a name may legitimately open with a digit or symbol
	// ("3D Gold", "+PLA"), and those say nothing about casing. `\p{L}` rather than
	// [a-zA-Z]: "Über ABS" is already capitalised, and treating Ü as a non-letter
	// would find the "b" and "fix" a real filament into "ÜBer ABS". `search` returns
	// a UTF-16 index, which is what the slices below need.
	const index = name.search(/\p{L}/u);
	if (index === -1) return null;
	// Take the whole code point, so an astral letter isn't split at its surrogate.
	const first = String.fromCodePoint(name.codePointAt(index)!);
	if (!isLowerCased(first)) return null;
	// eSUN / rPLA / iSANMATE — the manufacturer's own styling.
	const after = index + first.length;
	const next = after < name.length ? String.fromCodePoint(name.codePointAt(after)!) : '';
	if (next && isUpperCased(next)) return null;
	return { suggestion: name.slice(0, index) + first.toUpperCase() + name.slice(after) };
}

/**
 * Leading/trailing or repeated whitespace in a display name.
 *
 * #460 created a filament literally named `"Silk "`. The trailing space is invisible
 * in review, survives into every downstream consumer, and makes the entity look
 * distinct from the `"Silk"` the contributor meant.
 */
export function checkNameWhitespace(name: string): { suggestion: string; reason: string } | null {
	if (!name) return null;
	const collapsed = name.trim().replace(/\s+/g, ' ');
	if (collapsed === name) return null;
	return {
		suggestion: collapsed,
		reason:
			name !== name.trim()
				? 'has leading or trailing whitespace'
				: 'contains repeated whitespace'
	};
}

/**
 * Strings contributors type when they have no value (`certifications: ["NA"]`, #502).
 * Mirrors `_PLACEHOLDER_WORDS` in `ofd/validation/data_quality.py`.
 */
export const PLACEHOLDER_WORDS = new Set(['na', 'n/a', 'none', 'null', 'tbd', '-']);

/**
 * Empty or stand-in strings inside an array value.
 *
 * `certifications: [""]` (#453) reads downstream as "this filament has a
 * certification" whose name is blank, and `["NA"]` (#502) as one called "NA"; an
 * empty array says the true thing. Returns the indices to drop.
 */
export function checkPlaceholderEntries(values: unknown): number[] {
	if (!Array.isArray(values)) return [];
	return values.reduce<number[]>((indices, value, index) => {
		if (typeof value !== 'string') return indices;
		const normalised = value.trim().toLowerCase();
		if (normalised === '' || PLACEHOLDER_WORDS.has(normalised)) indices.push(index);
		return indices;
	}, []);
}

/**
 * `[lower, upper]` filament fields where the lower value must not exceed the upper.
 * Mirrors `_RANGE_PAIRS` in `ofd/validation/data_quality.py`.
 */
export const RANGE_PAIRS = [
	['min_print_temperature', 'max_print_temperature'],
	['min_bed_temperature', 'max_bed_temperature'],
	['min_fan_speed', 'max_fan_speed'],
	['dry_temperature', 'max_dry_temperature']
] as const;

export interface InvertedRange {
	low: string;
	high: string;
	lowValue: number;
	highValue: number;
}

/**
 * Lower bounds recorded above their upper bound, e.g. `min_fan_speed` 80 /
 * `max_fan_speed` 20. JSON Schema can't compare two fields, and the exporters copy
 * both values straight into slicer presets. Mirrors `_check_inverted_ranges`.
 */
export function findInvertedRanges(
	data: Record<string, unknown> | null | undefined
): InvertedRange[] {
	if (!data) return [];
	return RANGE_PAIRS.flatMap(([low, high]) => {
		const lowValue = data[low];
		const highValue = data[high];
		if (typeof lowValue !== 'number' || typeof highValue !== 'number') return [];
		return lowValue > highValue ? [{ low, high, lowValue, highValue }] : [];
	});
}

/**
 * A size's container material, reading the deprecated `spool_refill: true` as
 * `'refill'` so data that predates `container_material` keeps its refill flag.
 * Mirrors `_container_material` in `ofd/validation/data_quality.py`.
 */
export function containerMaterialOf(size: {
	container_material?: unknown;
	spool_refill?: unknown;
}): ContainerMaterial | undefined {
	const material = size.container_material;
	if (
		material === 'plastic' ||
		material === 'cardboard' ||
		material === 'mixed' ||
		material === 'refill'
	)
		return material;
	return size.spool_refill === true ? 'refill' : undefined;
}

/** The `(filament_weight, diameter)` spool identity, mirroring `size_dedupe_key`. */
function sizeKey(size: Record<string, unknown>): string {
	return `${size.filament_weight ?? ''}|${size.diameter ?? ''}`;
}

/**
 * Fields that make a spool row worth keeping, ignoring canonical identity.
 *
 * Blank values say nothing an absent field doesn't, so they must not be what tells two
 * rows apart. Kept in step with `_redundant_size_fields` in `ofd/validation/data_quality.py`.
 */
function meaningfulFields(size: Record<string, unknown>): Array<[string, unknown]> {
	return Object.entries(size).filter(
		([key, value]) =>
			key !== 'uuid' &&
			key !== 'moved_from' &&
			value !== undefined &&
			value !== null &&
			!(typeof value === 'string' && value.trim() === '')
	);
}

/** True when `size` says nothing `earlier` doesn't already say. */
function isSubsumed(size: Record<string, unknown>, earlier: Record<string, unknown>): boolean {
	if (sizeKey(size) !== sizeKey(earlier)) return false;
	// A spool and its refill share weight and diameter; the container material is
	// what tells them apart.
	if (containerMaterialOf(size) !== containerMaterialOf(earlier)) return false;
	const earlierFields = new Map(meaningfulFields(earlier));
	return meaningfulFields(size).every(
		([key, value]) =>
			earlierFields.has(key) &&
			JSON.stringify(earlierFields.get(key)) === JSON.stringify(value)
	);
}

/**
 * Spool rows that add nothing over an earlier row.
 *
 * Spool identity is `(filament_weight, diameter)` — the pairing `merge_sizes` and
 * `record_moved_from` use — so two rows sharing it are the same offering unless one
 * carries a value the other lacks (a distinct GTIN, article number, purchase link,
 * spool geometry). #453 shipped two 1 kg / 1.75 mm rows with nothing between them.
 *
 * Returns, for each redundant row, its index and the index it duplicates.
 */
export function findRedundantSizes(
	sizes: Array<Record<string, unknown>>
): Array<{ index: number; duplicateOf: number }> {
	const found: Array<{ index: number; duplicateOf: number }> = [];
	for (let i = 0; i < sizes.length; i++) {
		const size = sizes[i];
		if (!size || typeof size !== 'object') continue;
		for (let j = 0; j < i; j++) {
			const earlier = sizes[j];
			if (earlier && typeof earlier === 'object' && isSubsumed(size, earlier)) {
				found.push({ index: i, duplicateOf: j });
				break;
			}
		}
	}
	return found;
}

/**
 * Traits that every sibling colour of a filament carries but this variant does not.
 *
 * Traits are a property of the product line far more often than of the individual
 * colour: if the other colours of a filament are all silk, or all carbon-filled, or
 * all industrially compostable, this one almost certainly is too. Measured against
 * the current tree by leave-one-out over the 1,167 filaments with three or more
 * colours, a trait held by every sibling is held by the held-out variant
 * 7,412/7,461 = 99.3% of the time — the strongest signal available at entry time,
 * and stronger than anything derivable from the name.
 *
 * That is why reviewers keep writing this comment by hand ("all existing
 * `kingroon/PLA/silk_pla/*` variants include `traits.silk: true`, so omitting it here
 * makes the variant inconsistent"). This turns it into a suggestion at entry time.
 *
 * Unanimity is required deliberately: a trait on some-but-not-all siblings is what a
 * genuinely per-colour trait looks like (glitter on two of twelve colours), and
 * suggesting those would train contributors to dismiss the panel.
 *
 * @param siblingTraitSets one entry per sibling variant, listing its true traits
 * @param own              traits already selected on the variant being edited
 * @param minSiblings      below this many siblings there is no consensus to read
 * @returns trait keys every sibling has and this variant lacks, in first-seen order
 */
export function suggestTraitsFromSiblings(
	siblingTraitSets: string[][],
	own: Set<string> | ReadonlySet<string>,
	minSiblings = 2
): string[] {
	if (siblingTraitSets.length < minSiblings) return [];

	const [first, ...rest] = siblingTraitSets;
	const suggestions: string[] = [];
	for (const key of first) {
		if (own.has(key) || suggestions.includes(key)) continue;
		if (rest.every((set) => set.includes(key))) suggestions.push(key);
	}
	return suggestions;
}

/** The shape `findSharedPurchaseLinks` needs off a variant — nothing more. */
export interface VariantWithLinks {
	id?: string;
	slug?: string;
	name?: string;
	sizes?: Array<{ purchase_links?: Array<{ url?: string }> | null } | null> | null;
}

/**
 * Purchase-link URLs copied across several colours of the same filament.
 *
 * A link shared by three or more colours is almost always the filament's generic
 * product page pasted onto every variant, rather than the colour-specific page a
 * buyer needs — the same thing the Rust validator's DuplicateLink rule reports.
 *
 * Unlike the other checks here there is no safe auto-fix: only the contributor can
 * know whether a colour-specific page exists, so callers surface this and let the
 * user navigate. That is also why this returns the offending URLs and who shares
 * them rather than a bare count — the count alone cannot point anyone at the problem.
 *
 * @param threshold how many colours must share a URL before it is worth reporting
 * @returns one entry per shared URL, each listing the variant ids and names sharing it
 */
export function findSharedPurchaseLinks(
	variants: VariantWithLinks[],
	threshold = 3
): Array<{ url: string; variantIds: string[]; variantNames: string[] }> {
	const byUrl = new Map<string, Map<string, string>>();

	for (const variant of variants) {
		const id = variant?.slug ?? variant?.id;
		if (!id) continue;
		for (const size of variant.sizes ?? []) {
			for (const link of size?.purchase_links ?? []) {
				const url = link?.url;
				if (!url) continue;
				if (!byUrl.has(url)) byUrl.set(url, new Map());
				// A colour counts once however many spool sizes repeat the link.
				byUrl.get(url)!.set(id, variant.name ?? id);
			}
		}
	}

	const shared: Array<{ url: string; variantIds: string[]; variantNames: string[] }> = [];
	for (const [url, owners] of byUrl) {
		if (owners.size < threshold) continue;
		shared.push({
			url,
			variantIds: [...owners.keys()],
			variantNames: [...owners.values()]
		});
	}
	return shared;
}

/**
 * Order-insensitive identity of a display name, mirroring `_word_multiset` in
 * `ofd/validation/data_quality.py` — so `PLA CF` and `CF PLA` land on one key, which is
 * what `ofd/scripts/deduplicate_data.py` would offer to merge.
 */
function wordMultiset(slug: string): string {
	return slug.split('_').filter(Boolean).sort().join('_');
}

/** The shape {@link findDuplicateName} needs off an existing entity — nothing more. */
export interface NamedEntry {
	name: string;
	/** Folder id, when known. Falls back to the slugified name. */
	slug?: string;
}

/**
 * A name already taken by another filament of the same brand.
 *
 * #281: filament names should be unique *within a brand*, not merely within a material.
 * #280 shipped a PLA-CF filament that had snuck into the PETG material beside the real
 * one — two folders, one product, and nothing in the tree said so. The folder id is the
 * unit of comparison rather than the display name, because that is what actually
 * collides on disk: `PLA+` and `PLA` both slugify to `pla`.
 *
 * `word-order` matches are the near-duplicates the Python rule warns about
 * (`cf_pla` vs `pla_cf`); an `exact` match in the *same* material cannot be created at
 * all, so the caller words that case more strongly.
 *
 * Normalisation mirrors `generateSlug` in `entityService`; kept inline so this module
 * stays dependency-free and pure.
 */
export function findDuplicateName<T extends NamedEntry>(
	name: string,
	existing: T[]
): { match: T; kind: 'exact' | 'word-order' } | null {
	const slugify = (value: string) =>
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_|_$/g, '');

	const slug = slugify(name);
	if (!slug) return null;
	const words = wordMultiset(slug);

	let wordOrder: T | null = null;
	for (const entry of existing) {
		const otherSlug = slugify(entry.slug || entry.name || '');
		if (!otherSlug) continue;
		if (otherSlug === slug) return { match: entry, kind: 'exact' };
		if (!wordOrder && wordMultiset(otherSlug) === words) wordOrder = entry;
	}
	return wordOrder ? { match: wordOrder, kind: 'word-order' } : null;
}

// --- Sustainability data ------------------------------------------------------
//
// "Copy, never compute": every figure is copied from a cited source and the quote must
// show it. Mirrors the sustainability rules in `ofd/validation/data_quality.py`.

const SOURCE_FIELDS = ['source_url', 'source_quote', 'retrieved'] as const;
const PCT_FIELDS = new Set(['pct', 'recycled_pct', 'reduction_pct']);

/**
 * Matches `value` as written in prose: `5.85` or `5,85`, trailing zeros allowed, and
 * `7250` as `7,250` or `7 250` (thousands grouped by a comma, space, no-break or narrow
 * no-break space; `.` is always the decimal point). The digit boundaries stop `5.85`
 * from matching inside `15.85` or `5.851`.
 */
export function numberPattern(value: number): RegExp {
	const text = String(value);
	const [intPart, frac] = text.split('.');
	const head = intPart.length % 3 || 3;
	const groups = [intPart.slice(0, head)];
	for (let i = head; i < intPart.length; i += 3) groups.push(intPart.slice(i, i + 3));
	const separated = groups.slice(1).map((g) => `[, \\u00a0\\u202f]?${g}`);
	const integer = groups[0] + separated.join('');
	const number = frac ? `${integer}[.,]${frac}0*` : `${integer}(?:[.,]0+)?`;
	return new RegExp(`(?<![\\d.,])${number}(?!\\d)`);
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

/** One problem with a sourced entry, shown as an inline hint. */
export type EntryIssue = { level: 'error' | 'warning'; message: string };

/**
 * Problems with one sourced entry (a recycled/bio-based content object, a carbon
 * footprint, a relative claim, a size's container_details, or a mechanical value):
 * missing sources, a percentage outside 0-100, a date in the future, or a number
 * absent from the quote.
 */
export function checkSourcedEntry(
	entry: Record<string, unknown> | null | undefined,
	valueFields: string[],
	today: string = todayIso()
): string[] {
	if (!entry || typeof entry !== 'object') return [];
	const problems: string[] = [];

	const missing = SOURCE_FIELDS.filter((f) => !String(entry[f] ?? '').trim());
	if (missing.length) {
		problems.push(
			`Missing ${missing.join(', ')}. Every figure needs a source URL, a verbatim quote and the date it was retrieved.`
		);
	}

	const quote = typeof entry.source_quote === 'string' ? entry.source_quote : '';
	for (const field of valueFields) {
		const value = entry[field];
		if (typeof value !== 'number' || Number.isNaN(value)) continue;
		if (PCT_FIELDS.has(field) && (value < 0 || value > 100)) {
			problems.push(`${field} is ${value}; a percentage must be between 0 and 100.`);
		}
		if (quote.trim() && !numberPattern(value).test(quote)) {
			problems.push(
				`${field} is ${value}, but the quote does not contain that number. Copy the figure exactly as the source writes it.`
			);
		}
	}

	for (const field of ['retrieved', 'published']) {
		const raw = entry[field];
		if (typeof raw !== 'string' || !raw) continue;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
			problems.push(`${field} must be a date as YYYY-MM-DD.`);
		} else if (raw > today) {
			problems.push(`${field} ${raw} is in the future.`);
		}
	}
	const year = entry.reference_year;
	if (typeof year === 'number' && year > Number(today.slice(0, 4))) {
		problems.push(`reference_year ${year} is in the future.`);
	}

	return problems;
}

/**
 * The effective sustainability block of a variant: each field the variant sets replaces
 * the filament's field of the same name.
 */
export function effectiveSustainability(
	filament: Sustainability | undefined,
	variant: Sustainability | undefined
): Sustainability {
	return { ...(filament ?? {}), ...(variant ?? {}) };
}

/**
 * `recycled_content` and `traits.recycled` must agree on a variant. A positive
 * percentage without the trait is an error; the trait with no recycled content is
 * only a warning, and only once a sustainability block exists.
 */
export function checkRecycledTrait(
	filament: Sustainability | undefined,
	variant: Sustainability | undefined,
	hasRecycledTrait: boolean
): { level: 'error' | 'warning'; message: string } | null {
	const content = effectiveSustainability(filament, variant).recycled_content;
	const pct = content?.pct;
	if (typeof pct === 'number' && pct > 0 && !hasRecycledTrait) {
		return {
			level: 'error',
			message: `Recycled content is ${pct}% but the Recycled trait is not set.`
		};
	}
	const hasBlock =
		Object.keys(filament ?? {}).length > 0 || Object.keys(variant ?? {}).length > 0;
	if (hasRecycledTrait && hasBlock && (!content || pct === 0)) {
		return {
			level: 'warning',
			message: 'The Recycled trait is set and sustainability data exists, but there is no recycled content.'
		};
	}
	return null;
}

// --- Mechanical properties ----------------------------------------------------
//
// Each value is copied from the maker's data sheet in the unit it is published in, so
// the sourced-entry checks above apply to every entry, plus a unit that fits the
// property. Mirrors the mechanical rules in `ofd/validation/data_quality.py`.

const STRESS_UNITS = ['MPa', 'GPa', 'psi', 'ksi'];
const IMPACT_UNITS = ['kJ/m2', 'J/m', 'ft-lb/in'];
const TEMPERATURE_UNITS = ['°C', '°F'];

/** The units each property can be published in. */
export const MECHANICAL_UNITS: Record<string, string[]> = {
	tensile_modulus: STRESS_UNITS,
	tensile_strength: STRESS_UNITS,
	yield_strength: STRESS_UNITS,
	flexural_modulus: STRESS_UNITS,
	flexural_strength: STRESS_UNITS,
	elongation_at_break: ['%'],
	impact_strength: IMPACT_UNITS,
	impact_strength_notched: IMPACT_UNITS,
	heat_deflection_045: TEMPERATURE_UNITS,
	heat_deflection_18: TEMPERATURE_UNITS,
	vicat_softening: TEMPERATURE_UNITS
};

/** The numbers a mechanical entry's source quote must contain. */
export const MECHANICAL_VALUE_FIELDS = ['value', 'plus_minus'];

const PRINT_DIRECTIONS = new Set(['XY', 'XZ', 'Z']);

/**
 * Problems with one mechanical entry: the sourced-entry errors, a unit that does not
 * fit the property, and a print direction on moulded test bars (a warning).
 */
export function checkMechanicalEntry(
	entry: Record<string, unknown> | null | undefined,
	today: string = todayIso()
): EntryIssue[] {
	if (!entry || typeof entry !== 'object') return [];
	const issues: EntryIssue[] = checkSourcedEntry(entry, MECHANICAL_VALUE_FIELDS, today).map(
		(message) => ({ level: 'error', message })
	);

	const { property, unit, direction } = entry;
	const units = typeof property === 'string' ? MECHANICAL_UNITS[property] : undefined;
	if (units && typeof unit === 'string' && unit && !units.includes(unit)) {
		issues.push({
			level: 'error',
			message: `${unit} is not a unit for ${property}; use ${units.join(', ')}.`
		});
	}

	const specimen = entry.specimen as { process?: unknown } | null | undefined;
	if (
		specimen?.process === 'moulded' &&
		typeof direction === 'string' &&
		PRINT_DIRECTIONS.has(direction)
	) {
		issues.push({
			level: 'warning',
			message: `Moulded test bars have no print direction, but direction is ${direction}. Set it to unknown.`
		});
	}

	return issues;
}

/**
 * Entries that repeat an earlier entry's property, direction, condition, standard and
 * unit, as a map from the repeat's index to the first one's index.
 */
export function findDuplicateMechanical(
	entries: Array<Record<string, unknown> | null | undefined>
): Map<number, number> {
	const first = new Map<string, number>();
	const duplicates = new Map<number, number>();
	entries.forEach((entry, i) => {
		if (!entry || typeof entry !== 'object') return;
		const key = JSON.stringify(
			['property', 'direction', 'condition', 'standard', 'unit'].map((f) => {
				const v = entry[f];
				return typeof v === 'string' ? v.trim() || null : (v ?? null);
			})
		);
		const earlier = first.get(key);
		if (earlier === undefined) first.set(key, i);
		else duplicates.set(i, earlier);
	});
	return duplicates;
}
