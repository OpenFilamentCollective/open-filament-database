/**
 * Fiber / high-flow trait suggestions.
 *
 * Detects carbon-fiber (CF), glass-fiber (GF) and high-flow / high-speed (HF)
 * filaments from their name/material context and returns the trait keys that
 * such a filament should carry:
 *
 *   CF  ->  contains_carbon_fiber, abrasive
 *   GF  ->  contains_glass_fiber,  abrasive
 *   HF  ->  high_flow
 *
 * Carbon- and glass-fiber composites are abrasive (they need a hardened
 * nozzle), so `abrasive` is suggested alongside the fibre trait.
 *
 * This mirrors the server-side `ofd script apply_fiber_traits` detector
 * (ofd/scripts/apply_fiber_traits.py). The bare cf/gf/hf tokens require
 * non-letter boundaries (digits allowed, so cf10 / gf30 / 95a_hf still match).
 * The Python side uses a lookbehind; here we consume the preceding non-letter
 * with `(?:^|[^a-z])` instead so we don't rely on RegExp lookbehind support.
 */

interface FiberDetector {
	re: RegExp;
	traits: string[];
}

const DETECTORS: FiberDetector[] = [
	{
		re: /(?:^|[^a-z])cf(?![a-z])|carbon[\s_+-]?fib/,
		traits: ['contains_carbon_fiber', 'abrasive']
	},
	{ re: /(?:^|[^a-z])gf(?![a-z])|glass[\s_+-]?fib/, traits: ['contains_glass_fiber', 'abrasive'] },
	{ re: /(?:^|[^a-z])hf(?![a-z])|high[\s_+-]?flow|high[\s_+-]?speed/, traits: ['high_flow'] }
];

/**
 * Detect the traits suggested by the given name parts (material type, filament
 * name/slug, colour name, …). Parts are lowercased and joined with a non-letter
 * separator so tokens can only match within a single part.
 *
 * @returns Ordered, de-duplicated list of suggested trait keys (empty if none).
 */
export function detectSuggestedTraits(...parts: Array<string | null | undefined>): string[] {
	const text = parts
		.filter((p): p is string => !!p)
		.join(' / ')
		.toLowerCase();
	if (!text) return [];

	const keys: string[] = [];
	for (const detector of DETECTORS) {
		if (detector.re.test(text)) {
			for (const key of detector.traits) {
				if (!keys.includes(key)) keys.push(key);
			}
		}
	}
	return keys;
}
