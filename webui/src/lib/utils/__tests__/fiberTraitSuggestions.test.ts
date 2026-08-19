import { describe, it, expect } from 'vitest';
import { detectSuggestedTraits } from '../fiberTraitSuggestions';

describe('detectSuggestedTraits', () => {
	it('detects carbon fiber from a cf_* filament slug', () => {
		expect(detectSuggestedTraits('PLA', 'cf_pla', 'Black')).toEqual([
			'contains_carbon_fiber',
			'abrasive'
		]);
	});

	it('detects carbon fiber from "carbon fiber" wording in a colour name', () => {
		expect(detectSuggestedTraits('PLA', 'matte_pla', 'Carbon Fiber Black')).toEqual([
			'contains_carbon_fiber',
			'abrasive'
		]);
	});

	it('detects glass fiber from gf tokens including a percentage suffix', () => {
		expect(detectSuggestedTraits('ABS', 'gf25', 'Black')).toEqual([
			'contains_glass_fiber',
			'abrasive'
		]);
		expect(detectSuggestedTraits('PA6', 'pa6_gf', 'Natural')).toEqual([
			'contains_glass_fiber',
			'abrasive'
		]);
	});

	it('detects high flow from high-speed / high-flow / bare hf names', () => {
		expect(detectSuggestedTraits('PLA', 'high_speed_pla', 'Red')).toEqual(['high_flow']);
		expect(detectSuggestedTraits('PETG', 'petg_hf', 'Black')).toEqual(['high_flow']);
		expect(detectSuggestedTraits('TPU', '95a_hf', 'White')).toEqual(['high_flow']);
		expect(detectSuggestedTraits('PLA', 'pla_premium_highspeed', 'Blue')).toEqual(['high_flow']);
	});

	it('combines codes when a filament is both fiber and high flow', () => {
		expect(detectSuggestedTraits('PETG', 'high_speed_cf_petg', 'Black')).toEqual([
			'contains_carbon_fiber',
			'abrasive',
			'high_flow'
		]);
	});

	it('does not match cf/gf/hf embedded inside a word', () => {
		expect(detectSuggestedTraits('PLA', 'scfoo_pla', 'Off White')).toEqual([]);
		expect(detectSuggestedTraits('PLA', 'pla', 'Highball Orange')).toEqual([]);
		expect(detectSuggestedTraits('PLA', 'pla', 'Graphite')).toEqual([]);
	});

	it('returns an empty array for a plain filament and for no input', () => {
		expect(detectSuggestedTraits('PLA', 'basic_pla', 'Galaxy Black')).toEqual([]);
		expect(detectSuggestedTraits()).toEqual([]);
		expect(detectSuggestedTraits('', null, undefined)).toEqual([]);
	});
});
