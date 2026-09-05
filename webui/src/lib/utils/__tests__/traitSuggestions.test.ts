import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildTraitRules, detectSuggestedTraits } from '../traitSuggestions';

// The rules under test are the real ones. Reading the table off disk (rather than
// restating a fixture) is the point of the exercise: it is what proves the shared
// trait_rules.json stays loadable by the JS side, and that its patterns — which must
// also parse in Python — do what the notes on them claim.
const schemasDir = join(process.cwd(), '..', 'schemas');
const traitRulesDoc = JSON.parse(readFileSync(join(schemasDir, 'trait_rules.json'), 'utf-8'));
const variantSchema = JSON.parse(readFileSync(join(schemasDir, 'variant_schema.json'), 'utf-8'));
const rules = buildTraitRules(traitRulesDoc);
const detect = (...parts: Array<string | null | undefined>) =>
	detectSuggestedTraits(rules, ...parts);

describe('buildTraitRules', () => {
	it('loads the shared rule table out of trait_rules.json', () => {
		expect(rules.length).toBeGreaterThan(0);
		expect(rules.map((r) => r.id)).toContain('carbon_fiber');
	});

	it('only the fiber/high-flow rules are enforced by the validator and backfill', () => {
		const enforced = rules.filter((r) => r.appliesTo.has('validate')).map((r) => r.id);
		expect(enforced).toEqual(['carbon_fiber', 'glass_fiber', 'high_flow']);
	});

	// The table is deliberately decoupled from the schema that defines traits, so this
	// cross-check is what keeps a typo'd key from silently suggesting nothing.
	it('every suggested trait key exists in the schema that defines traits', () => {
		const known = new Set(Object.keys(variantSchema.properties.traits.properties));
		for (const rule of rules) {
			for (const key of rule.traits) expect(known).toContain(key);
		}
	});

	it('survives a malformed or missing table without throwing', () => {
		expect(buildTraitRules(null)).toEqual([]);
		expect(buildTraitRules({})).toEqual([]);
		expect(buildTraitRules({ rules: 'nope' })).toEqual([]);
		// A single bad entry is skipped, the good ones still load.
		const mixed = buildTraitRules({
			rules: [
				{ id: 'broken', pattern: '([unclosed', traits: ['silk'] },
				{ id: 'ok', pattern: 'silk', traits: ['silk'] }
			]
		});
		expect(mixed.map((r) => r.id)).toEqual(['ok']);
	});
});

describe('detectSuggestedTraits', () => {
	it('detects carbon fiber from a cf_* filament slug', () => {
		expect(detect('PLA', 'cf_pla', 'Black')).toEqual(['contains_carbon_fiber', 'abrasive']);
	});

	it('detects carbon fiber from "carbon fiber" wording in a colour name', () => {
		expect(detect('PLA', 'matte_pla', 'Carbon Fiber Black')).toEqual([
			'contains_carbon_fiber',
			'abrasive',
			'matte'
		]);
	});

	it('detects glass fiber from gf tokens including a percentage suffix', () => {
		expect(detect('ABS', 'gf25', 'Black')).toEqual(['contains_glass_fiber', 'abrasive']);
		expect(detect('PA6', 'pa6_gf', 'Natural')).toEqual(['contains_glass_fiber', 'abrasive']);
	});

	it('detects high flow from high-speed / high-flow / bare hf names', () => {
		expect(detect('PLA', 'high_speed_pla', 'Red')).toEqual(['high_flow']);
		expect(detect('PETG', 'petg_hf', 'Black')).toEqual(['high_flow']);
		expect(detect('TPU', '95a_hf', 'White')).toEqual(['high_flow']);
		expect(detect('PLA', 'pla_premium_highspeed', 'Blue')).toEqual(['high_flow']);
	});

	it('combines rules when a filament matches several', () => {
		expect(detect('PETG', 'high_speed_cf_petg', 'Black')).toEqual([
			'contains_carbon_fiber',
			'abrasive',
			'high_flow'
		]);
	});

	it('detects the appearance rules added alongside the fiber codes', () => {
		expect(detect('PLA', 'silk_pla', 'Gold')).toEqual(['silk']);
		expect(detect('PLA', 'pla', 'Glow in the Dark Green')).toEqual(['glow']);
		expect(detect('PLA', 'pla', 'Bicolor Blue Green')).toEqual(['coextruded']);
		expect(detect('PLA', 'pla', 'Fluorescent Orange')).toEqual(['neon']);
		expect(detect('PLA', 'matte_pla', 'Charcoal')).toEqual(['matte']);
	});

	it('does not match cf/gf/hf embedded inside a word', () => {
		expect(detect('PLA', 'scfoo_pla', 'Off White')).toEqual([]);
		expect(detect('PLA', 'pla', 'Highball Orange')).toEqual([]);
		expect(detect('PLA', 'pla', 'Graphite')).toEqual([]);
	});

	it('returns an empty array for a plain filament and for no input', () => {
		expect(detect('PLA', 'basic_pla', 'Galaxy Black')).toEqual([]);
		expect(detect()).toEqual([]);
		expect(detect('', null, undefined)).toEqual([]);
	});

	it('yields nothing when the rule table failed to load', () => {
		expect(detectSuggestedTraits([], 'PLA', 'cf_pla', 'Black')).toEqual([]);
	});
});
