/**
 * Name-derived trait suggestions.
 *
 * The rules live in `schemas/trait_rules.json`, served here by `/api/trait-rules`.
 * That one table is read by this module, by the `fiber_trait_missing` validator and
 * by `ofd script apply_fiber_traits` (see `ofd/scripts/apply_fiber_traits.py`), so
 * the detection logic exists once rather than in three hand-synced copies.
 *
 * It is its own file rather than an extension of the variant schema because a rule
 * maps a name to trait keys and says nothing about which entity carries them — it
 * stays correct if traits move up to the filament.
 *
 * Each rule names the traits a matching name implies, e.g.
 *
 *   CF  ->  contains_carbon_fiber, abrasive
 *   GF  ->  contains_glass_fiber,  abrasive
 *   HF  ->  high_flow
 *
 * Carbon- and glass-fiber composites are abrasive (they need a hardened
 * nozzle), so `abrasive` is suggested alongside the fibre trait.
 *
 * A rule's `applies_to` says who may act on it. Everything with `suggest` is
 * offered here; only the fiber/high-flow rules also carry `validate`/`backfill`,
 * because they are true by definition. The softer appearance rules (silk, matte,
 * glitter, …) are suggestions only — the editor proposes them and the
 * contributor decides, which is why a rule that is right ~75% of the time still
 * earns its place.
 *
 * Patterns must parse in both Python `re` and JS `RegExp`, so they consume the
 * preceding non-letter with `(?:^|[^a-z])` rather than using a lookbehind. Bare
 * cf/gf/hf tokens require non-letter boundaries (digits allowed, so cf10 / gf30 /
 * 95a_hf still match).
 */

export interface TraitRule {
	id: string;
	/** Short label used in messages ('CF'); falls back to `id`. */
	code?: string;
	regex: RegExp;
	traits: string[];
	appliesTo: Set<string>;
}

/**
 * Parse the rule table out of a `trait_rules.json` document.
 *
 * Malformed entries are skipped rather than thrown on — suggestions are a
 * convenience, and a bad rule must never stop the form from rendering.
 */
export function buildTraitRules(doc: any): TraitRule[] {
	const raw = doc?.rules;
	if (!Array.isArray(raw)) return [];

	const rules: TraitRule[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const { id, pattern, traits, applies_to: appliesTo, code } = entry as Record<string, any>;
		if (typeof id !== 'string' || typeof pattern !== 'string' || !Array.isArray(traits)) continue;
		let regex: RegExp;
		try {
			regex = new RegExp(pattern);
		} catch {
			continue;
		}
		rules.push({
			id,
			code: typeof code === 'string' ? code : undefined,
			regex,
			traits: traits.filter((t): t is string => typeof t === 'string'),
			appliesTo: new Set<string>(Array.isArray(appliesTo) ? appliesTo : ['suggest'])
		});
	}
	return rules;
}

/**
 * Detect the traits suggested by the given name parts (material type, filament
 * name/slug, colour name, …). Parts are lowercased and joined with a non-letter
 * separator so tokens can only match within a single part.
 *
 * @returns Ordered, de-duplicated list of suggested trait keys (empty if none).
 */
export function detectSuggestedTraits(
	rules: TraitRule[],
	...parts: Array<string | null | undefined>
): string[] {
	const text = parts
		.filter((p): p is string => !!p)
		.join(' / ')
		.toLowerCase();
	if (!text) return [];

	const keys: string[] = [];
	for (const rule of rules) {
		if (!rule.appliesTo.has('suggest') || !rule.regex.test(text)) continue;
		for (const key of rule.traits) {
			if (!keys.includes(key)) keys.push(key);
		}
	}
	return keys;
}

/**
 * The trait keys a variant actually carries.
 *
 * Only `true` values are written to `variant.json`, but a form in flight can leave a
 * key behind set to `false`, so presence alone is not enough to go on.
 */
export function trueTraitKeys(variant: { traits?: object | null }): string[] {
	const traits = variant?.traits as Record<string, unknown> | null | undefined;
	if (!traits || typeof traits !== 'object') return [];
	return Object.keys(traits).filter((key) => traits[key] === true);
}

// Module-level cache + in-flight dedupe: every open variant form wants the same
// table, and it never changes within a session.
let rulesCache: TraitRule[] | null = null;
let rulesPromise: Promise<TraitRule[]> | null = null;

/**
 * Load the shared rule table. Resolves to `[]` rather than rejecting if the table is
 * unavailable, so a caller can await it unguarded.
 */
export async function loadTraitRules(): Promise<TraitRule[]> {
	if (rulesCache) return rulesCache;
	if (rulesPromise) return rulesPromise;

	rulesPromise = (async () => {
		try {
			const response = await fetch('/api/trait-rules');
			rulesCache = response.ok ? buildTraitRules(await response.json()) : [];
		} catch {
			rulesCache = [];
		} finally {
			rulesPromise = null;
		}
		return rulesCache;
	})();

	return rulesPromise;
}
