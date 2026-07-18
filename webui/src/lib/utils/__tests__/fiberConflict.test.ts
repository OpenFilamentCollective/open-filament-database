import { describe, it, expect } from 'vitest';
import {
	CARBON_FIBER_TRAIT,
	GLASS_FIBER_TRAIT,
	fibersFromTraits,
	fibersFromTraitKeys,
	collectSiblingFibers,
	checkFiberConflict,
	blockedFiberTraitKeys
} from '../fiberConflict';

const cf = (extra: Record<string, unknown> = {}) => ({ [CARBON_FIBER_TRAIT]: true, ...extra });
const gf = (extra: Record<string, unknown> = {}) => ({ [GLASS_FIBER_TRAIT]: true, ...extra });

describe('fibersFromTraits', () => {
	it('extracts only true fiber traits', () => {
		expect([...fibersFromTraits(cf({ abrasive: true }))]).toEqual(['carbon']);
		expect([...fibersFromTraits(gf())]).toEqual(['glass']);
		expect([...fibersFromTraits({ [CARBON_FIBER_TRAIT]: false })]).toEqual([]);
		expect([...fibersFromTraits(null)]).toEqual([]);
		expect([...fibersFromTraits({ abrasive: true, high_flow: true })]).toEqual([]);
	});

	it('reads a variant carrying both fibers', () => {
		const both = fibersFromTraits({ [CARBON_FIBER_TRAIT]: true, [GLASS_FIBER_TRAIT]: true });
		expect(both.has('carbon')).toBe(true);
		expect(both.has('glass')).toBe(true);
	});
});

describe('fibersFromTraitKeys', () => {
	it('maps selected trait keys to fiber kinds', () => {
		expect([...fibersFromTraitKeys([CARBON_FIBER_TRAIT, 'abrasive'])]).toEqual(['carbon']);
		expect([...fibersFromTraitKeys(new Set([GLASS_FIBER_TRAIT]))]).toEqual(['glass']);
		expect([...fibersFromTraitKeys(['high_flow'])]).toEqual([]);
	});
});

describe('collectSiblingFibers', () => {
	const variants = [
		{ slug: 'black', traits: cf() },
		{ slug: 'blue', traits: cf() },
		{ slug: 'natural', traits: {} }
	];

	it('unions fibers across siblings', () => {
		expect([...collectSiblingFibers(variants)]).toEqual(['carbon']);
	});

	it('excludes the variant being edited (case-insensitive)', () => {
		const mixed = [
			{ slug: 'black', traits: cf() },
			{ slug: 'natural', traits: gf() }
		];
		// Editing "natural" should not see its own glass trait.
		expect([...collectSiblingFibers(mixed, 'NATURAL')]).toEqual(['carbon']);
	});

	it('handles empty/undefined input', () => {
		expect([...collectSiblingFibers(undefined)]).toEqual([]);
		expect([...collectSiblingFibers([])]).toEqual([]);
	});
});

describe('checkFiberConflict', () => {
	it('passes when only one fiber kind is present', () => {
		expect(checkFiberConflict(new Set(['carbon']), new Set(['carbon']))).toBeNull();
		expect(checkFiberConflict(new Set(), new Set(['glass']))).toBeNull();
		expect(checkFiberConflict(new Set(['glass']), new Set())).toBeNull();
	});

	it('flags a variant that adds CF when a sibling has GF', () => {
		const conflict = checkFiberConflict(new Set(['carbon']), new Set(['glass']));
		expect(conflict).not.toBeNull();
		expect(conflict!.kind).toBe('carbon');
		expect(conflict!.conflictsWith).toBe('glass');
		expect(conflict!.sameVariant).toBe(false);
		expect(conflict!.message).toMatch(/glass fiber/);
	});

	it('flags a variant that adds GF when a sibling has CF', () => {
		const conflict = checkFiberConflict(new Set(['glass']), new Set(['carbon']));
		expect(conflict!.kind).toBe('glass');
		expect(conflict!.conflictsWith).toBe('carbon');
	});

	it('flags a single variant carrying both fibers (same-variant)', () => {
		const conflict = checkFiberConflict(new Set(['carbon', 'glass']), new Set());
		expect(conflict!.sameVariant).toBe(true);
		expect(conflict!.message).toMatch(/cannot contain both/);
	});

	it('does not blame a fiber-less variant when siblings alone mix CF and GF', () => {
		// Pre-existing/legacy filament where OTHER variants already hold both fibers.
		// The current (fiber-less) variant is innocent and must stay editable.
		expect(checkFiberConflict(new Set(), new Set(['carbon', 'glass']))).toBeNull();
	});

	it('only flags when this variant\'s own fiber opposes a sibling', () => {
		// Carbon variant in an all-carbon filament (siblings also hold glass) is still
		// flagged because a glass sibling genuinely opposes this variant's carbon.
		const conflict = checkFiberConflict(new Set(['carbon']), new Set(['carbon', 'glass']));
		expect(conflict!.kind).toBe('carbon');
		expect(conflict!.conflictsWith).toBe('glass');
		// But a carbon variant among only-carbon siblings is fine.
		expect(checkFiberConflict(new Set(['carbon']), new Set(['carbon']))).toBeNull();
	});
});

describe('blockedFiberTraitKeys', () => {
	it('blocks the opposite fiber once one is established by siblings', () => {
		expect([...blockedFiberTraitKeys(new Set(), new Set(['glass']))]).toEqual([CARBON_FIBER_TRAIT]);
		expect([...blockedFiberTraitKeys(new Set(), new Set(['carbon']))]).toEqual([GLASS_FIBER_TRAIT]);
	});

	it('blocks the opposite fiber once one is selected on this variant', () => {
		expect([...blockedFiberTraitKeys(new Set(['carbon']), new Set())]).toEqual([GLASS_FIBER_TRAIT]);
	});

	it('never blocks a fiber already selected on this variant', () => {
		// In a conflict state the user must be able to remove carbon, so carbon is not blocked.
		const blocked = blockedFiberTraitKeys(new Set(['carbon']), new Set(['glass']));
		expect(blocked.has(CARBON_FIBER_TRAIT)).toBe(false);
		expect(blocked.has(GLASS_FIBER_TRAIT)).toBe(true);
	});

	it('blocks nothing when no fiber is present', () => {
		expect([...blockedFiberTraitKeys(new Set(), new Set())]).toEqual([]);
	});
});
