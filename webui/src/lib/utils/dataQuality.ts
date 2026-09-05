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
 * Empty strings inside an array value.
 *
 * `certifications: [""]` (#453) reads downstream as "this filament has a
 * certification" whose name is blank; an empty array says the true thing. Returns the
 * indices to drop.
 */
export function checkPlaceholderEntries(values: unknown): number[] {
	if (!Array.isArray(values)) return [];
	return values.reduce<number[]>((indices, value, index) => {
		if (typeof value === 'string' && value.trim() === '') indices.push(index);
		return indices;
	}, []);
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
