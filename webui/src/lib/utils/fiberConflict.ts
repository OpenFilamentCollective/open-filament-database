/**
 * Carbon-fiber / glass-fiber conflict guard.
 *
 * A single filament line is reinforced with carbon fiber, with glass fiber, or
 * with neither — never a mix. It is therefore invalid for one variant of a
 * filament to carry `contains_carbon_fiber` while another (or the same one)
 * carries `contains_glass_fiber`. This module is the single source of truth for
 * that rule on the webui side; the equivalent server/CI check lives in
 * `ofd/validation/fiber_consistency.py`.
 */

export const CARBON_FIBER_TRAIT = 'contains_carbon_fiber';
export const GLASS_FIBER_TRAIT = 'contains_glass_fiber';

export type FiberKind = 'carbon' | 'glass';

/** Trait key that marks each fiber kind. */
export const FIBER_TRAIT: Record<FiberKind, string> = {
	carbon: CARBON_FIBER_TRAIT,
	glass: GLASS_FIBER_TRAIT
};

/** Human-readable label for each fiber kind (used in guard-rail messages). */
export const FIBER_LABEL: Record<FiberKind, string> = {
	carbon: 'carbon fiber',
	glass: 'glass fiber'
};

const TRAIT_TO_KIND: Record<string, FiberKind> = {
	[CARBON_FIBER_TRAIT]: 'carbon',
	[GLASS_FIBER_TRAIT]: 'glass'
};

/**
 * Fiber kinds present in a variant `traits` object (only `true` counts).
 * Accepts `unknown` so callers can pass the typed `VariantTraits` interface (a
 * closed type with no index signature) or raw form data without a cast.
 */
export function fibersFromTraits(traits: unknown): Set<FiberKind> {
	const out = new Set<FiberKind>();
	if (!traits || typeof traits !== 'object') return out;
	for (const [key, value] of Object.entries(traits as Record<string, unknown>)) {
		if (value === true && key in TRAIT_TO_KIND) out.add(TRAIT_TO_KIND[key]);
	}
	return out;
}

/** Fiber kinds present in a set/list of selected trait keys. */
export function fibersFromTraitKeys(keys: Iterable<string>): Set<FiberKind> {
	const out = new Set<FiberKind>();
	for (const key of keys) {
		if (key in TRAIT_TO_KIND) out.add(TRAIT_TO_KIND[key]);
	}
	return out;
}

/** Loosely-typed variant shape this module needs (traits + an identifier). */
interface VariantLike {
	slug?: string;
	id?: string;
	name?: string;
	traits?: unknown;
}

/**
 * Union of fiber kinds already established by a filament's variants.
 *
 * @param variants   Sibling variants of the filament.
 * @param excludeKey slug/id of a variant to ignore (the one being edited), so a
 *                   variant is never counted as conflicting with itself.
 */
export function collectSiblingFibers(
	variants: readonly VariantLike[] | null | undefined,
	excludeKey?: string | null
): Set<FiberKind> {
	const out = new Set<FiberKind>();
	if (!variants) return out;
	const exclude = excludeKey?.toLowerCase();
	for (const v of variants) {
		const key = (v.slug ?? v.id ?? '').toLowerCase();
		if (exclude && key === exclude) continue;
		for (const fiber of fibersFromTraits(v.traits)) out.add(fiber);
	}
	return out;
}

export interface FiberConflict {
	/** The fiber the current variant would carry that creates the conflict. */
	kind: FiberKind;
	/** The fiber it collides with (already present elsewhere or on this variant). */
	conflictsWith: FiberKind;
	/** True when both fibers are selected on the same variant. */
	sameVariant: boolean;
	/** User-facing explanation of the conflict. */
	message: string;
}

function conflictMessage(kind: FiberKind, other: FiberKind, sameVariant: boolean): string {
	if (sameVariant) {
		return 'A variant cannot contain both carbon fiber and glass fiber — pick one.';
	}
	return `Another variant of this filament is ${FIBER_LABEL[other]}, so this one can't be ${FIBER_LABEL[kind]}. A filament can't mix carbon fiber and glass fiber across its variants.`;
}

/**
 * Determine whether the fibers a variant would carry conflict with the fibers
 * already established by its sibling variants (a filament can't mix CF and GF).
 *
 * @returns the conflict, or `null` when there is none.
 */
export function checkFiberConflict(
	currentFibers: Set<FiberKind>,
	siblingFibers: Set<FiberKind>
): FiberConflict | null {
	const present = new Set<FiberKind>([...currentFibers, ...siblingFibers]);
	if (!(present.has('carbon') && present.has('glass'))) return null;

	// Same-variant conflict takes priority — the fix is to drop one trait here.
	if (currentFibers.has('carbon') && currentFibers.has('glass')) {
		return {
			kind: 'carbon',
			conflictsWith: 'glass',
			sameVariant: true,
			message: conflictMessage('carbon', 'glass', true)
		};
	}

	// Otherwise the current variant introduces one fiber that a sibling contradicts.
	const kind: FiberKind = currentFibers.has('carbon') ? 'carbon' : 'glass';
	const conflictsWith: FiberKind = kind === 'carbon' ? 'glass' : 'carbon';
	return { kind, conflictsWith, sameVariant: false, message: conflictMessage(kind, conflictsWith, false) };
}

/**
 * Fiber trait keys that must NOT be added to the current variant because doing so
 * would make the filament (siblings + this variant) contain both CF and GF.
 * A fiber already selected on this variant is never "blocked" — removing it is
 * how the user resolves a conflict.
 */
export function blockedFiberTraitKeys(
	currentFibers: Set<FiberKind>,
	siblingFibers: Set<FiberKind>
): Set<string> {
	const present = new Set<FiberKind>([...currentFibers, ...siblingFibers]);
	const blocked = new Set<FiberKind>();
	if (present.has('carbon')) blocked.add('glass');
	if (present.has('glass')) blocked.add('carbon');
	for (const kind of currentFibers) blocked.delete(kind);
	return new Set([...blocked].map((k) => FIBER_TRAIT[k]));
}

/**
 * Whole-filament invariant: scan every variant and report the first CF/GF
 * conflict found (mixed across variants, or both on a single variant). Used by
 * save-time guards and mirrors the Python CI check.
 */
export function findFilamentFiberConflict(
	variants: readonly VariantLike[] | null | undefined
): (FiberConflict & { variant?: string; otherVariant?: string }) | null {
	if (!variants) return null;
	let carbonVariant: VariantLike | undefined;
	let glassVariant: VariantLike | undefined;
	for (const v of variants) {
		const fibers = fibersFromTraits(v.traits);
		if (fibers.has('carbon') && fibers.has('glass')) {
			return {
				kind: 'carbon',
				conflictsWith: 'glass',
				sameVariant: true,
				message: conflictMessage('carbon', 'glass', true),
				variant: v.name ?? v.slug ?? v.id
			};
		}
		if (fibers.has('carbon')) carbonVariant ??= v;
		if (fibers.has('glass')) glassVariant ??= v;
	}
	if (carbonVariant && glassVariant) {
		return {
			kind: 'carbon',
			conflictsWith: 'glass',
			sameVariant: false,
			message: conflictMessage('carbon', 'glass', false),
			variant: carbonVariant.name ?? carbonVariant.slug ?? carbonVariant.id,
			otherVariant: glassVariant.name ?? glassVariant.slug ?? glassVariant.id
		};
	}
	return null;
}
