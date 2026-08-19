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
 * Fiber-trait detection is not repeated here: `fiberTraitSuggestions.ts` already
 * mirrors the same Python detector and is wired into `VariantForm`.
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
