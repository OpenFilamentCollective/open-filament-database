/**
 * Smart title generator for change submissions.
 *
 * Analyzes the set of pending changes and produces a concise, descriptive
 * PR / commit title instead of the generic "Update filament database (N changes)".
 *
 * Examples of generated titles:
 *   "Add Prusament brand with PLA and PETG filaments"
 *   "Add 12 color variants to Bambu Lab PLA Basic"
 *   "Update Prusament PLA Basic specifications"
 *   "Add Elegoo as a new store"
 *   "Remove discontinued eSun ABS+ variants"
 *   "Add Polymaker brand"
 *   "Update Bambu Lab PLA Basic and add 3 variants"
 */

import type { EntityChange } from '$lib/types/changes';
import { parsePath } from '$lib/utils/changePaths';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface ChangeAnalysis {
	brands: GroupedChanges;
	materials: GroupedChanges;
	filaments: GroupedChanges;
	variants: GroupedChanges;
	stores: GroupedChanges;
}

interface GroupedChanges {
	created: EntityChange[];
	updated: EntityChange[];
	deleted: EntityChange[];
}

interface BrandBreakdown {
	brandId: string;
	brandName: string;
	brandOp: 'create' | 'update' | 'delete' | null;
	materialNames: string[];
	filamentNames: string[];
	variantCount: number;
	totalChildren: number;
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function entityName(change: EntityChange): string {
	return change.data?.name || change.data?.material || change.data?.id || change.entity.id;
}

function brandIdFromChange(change: EntityChange): string | null {
	const ep = parsePath(change.entity.path);
	if (!ep || ep.type === 'store') return null;
	return ep.brandId;
}

function pluralize(word: string, count: number): string {
	if (count === 1) return word;
	const irregulars: Record<string, string> = { variant: 'variants', filament: 'filaments', material: 'materials', brand: 'brands', store: 'stores' };
	return irregulars[word] || `${word}s`;
}

function groupByOperation(changes: EntityChange[]): GroupedChanges {
	return {
		created: changes.filter((c) => c.operation === 'create'),
		updated: changes.filter((c) => c.operation === 'update'),
		deleted: changes.filter((c) => c.operation === 'delete')
	};
}

function analyze(changes: EntityChange[]): ChangeAnalysis {
	const byType: Record<string, EntityChange[]> = {
		brand: [],
		material: [],
		filament: [],
		variant: [],
		store: []
	};

	for (const c of changes) {
		const bucket = byType[c.entity.type];
		if (bucket) bucket.push(c);
	}

	return {
		brands: groupByOperation(byType.brand),
		materials: groupByOperation(byType.material),
		filaments: groupByOperation(byType.filament),
		variants: groupByOperation(byType.variant),
		stores: groupByOperation(byType.store)
	};
}

/** Build per-brand breakdown of what changed. */
function buildBrandBreakdowns(changes: EntityChange[]): BrandBreakdown[] {
	const map = new Map<string, BrandBreakdown>();

	for (const c of changes) {
		const brandId = brandIdFromChange(c);
		if (!brandId) continue;

		if (!map.has(brandId)) {
			map.set(brandId, {
				brandId,
				brandName: brandId,
				brandOp: null,
				materialNames: [],
				filamentNames: [],
				variantCount: 0,
				totalChildren: 0
			});
		}
		const bd = map.get(brandId)!;

		switch (c.entity.type) {
			case 'brand':
				bd.brandName = entityName(c);
				bd.brandOp = c.operation;
				break;
			case 'material':
				bd.materialNames.push(entityName(c));
				bd.totalChildren++;
				break;
			case 'filament':
				bd.filamentNames.push(entityName(c));
				bd.totalChildren++;
				break;
			case 'variant':
				bd.variantCount++;
				bd.totalChildren++;
				break;
		}
	}

	return [...map.values()];
}

function joinList(items: string[], max = 3): string {
	if (items.length <= max) return items.join(', ');
	return `${items.slice(0, max - 1).join(', ')} and ${items.length - max + 1} more`;
}

function opVerb(op: 'create' | 'update' | 'delete'): string {
	switch (op) {
		case 'create': return 'Add';
		case 'update': return 'Update';
		case 'delete': return 'Remove';
	}
}

function opVerbPast(op: 'create' | 'update' | 'delete'): string {
	switch (op) {
		case 'create': return 'add';
		case 'update': return 'update';
		case 'delete': return 'remove';
	}
}

// ────────────────────────────────────────────────────────────────
// Title generators for specific patterns
// ────────────────────────────────────────────────────────────────

/** All changes are store-related. */
function tryStoreOnlyTitle(a: ChangeAnalysis): string | null {
	const storeTotal = a.stores.created.length + a.stores.updated.length + a.stores.deleted.length;
	const otherTotal =
		a.brands.created.length + a.brands.updated.length + a.brands.deleted.length +
		a.materials.created.length + a.materials.updated.length + a.materials.deleted.length +
		a.filaments.created.length + a.filaments.updated.length + a.filaments.deleted.length +
		a.variants.created.length + a.variants.updated.length + a.variants.deleted.length;

	if (storeTotal === 0 || otherTotal > 0) return null;

	// Single store
	if (storeTotal === 1) {
		const change = [...a.stores.created, ...a.stores.updated, ...a.stores.deleted][0];
		return `${opVerb(change.operation)} ${entityName(change)} store`;
	}

	// Multiple stores, same operation
	const ops = [
		{ op: 'create' as const, list: a.stores.created },
		{ op: 'update' as const, list: a.stores.updated },
		{ op: 'delete' as const, list: a.stores.deleted }
	].filter((o) => o.list.length > 0);

	if (ops.length === 1) {
		const { op, list } = ops[0];
		const names = list.map(entityName);
		return `${opVerb(op)} ${pluralize('store', list.length)}: ${joinList(names)}`;
	}

	return `Update ${storeTotal} stores`;
}

/**
 * Single brand created with all its children (materials, filaments, variants).
 * e.g. "Add Prusament brand with PLA and PETG filaments"
 */
function trySingleNewBrandTitle(a: ChangeAnalysis, breakdowns: BrandBreakdown[]): string | null {
	if (a.brands.created.length !== 1) return null;
	if (a.brands.updated.length > 0 || a.brands.deleted.length > 0) return null;

	// All other changes must belong to the same brand
	const bd = breakdowns.find((b) => b.brandOp === 'create');
	if (!bd) return null;
	if (breakdowns.length > 1) return null;

	let suffix = '';
	if (bd.materialNames.length > 0 && bd.filamentNames.length === 0) {
		suffix = ` with ${joinList(bd.materialNames)} ${pluralize('material', bd.materialNames.length)}`;
	} else if (bd.filamentNames.length > 0) {
		suffix = ` with ${joinList(bd.filamentNames)} ${pluralize('filament', bd.filamentNames.length)}`;
		if (bd.variantCount > 0) {
			suffix += ` and ${bd.variantCount} ${pluralize('variant', bd.variantCount)}`;
		}
	} else if (bd.variantCount > 0) {
		suffix = ` with ${bd.variantCount} ${pluralize('variant', bd.variantCount)}`;
	}

	return `Add ${bd.brandName} brand${suffix}`;
}

/**
 * All changes belong to a single brand (existing brand, no brand-level create).
 * e.g. "Add 5 color variants to Bambu Lab PLA Basic"
 * e.g. "Update Prusament PLA specifications"
 */
function trySingleBrandTitle(a: ChangeAnalysis, breakdowns: BrandBreakdown[], changes: EntityChange[]): string | null {
	if (breakdowns.length !== 1) return null;
	const bd = breakdowns[0];

	// Brand itself was updated
	if (bd.brandOp === 'update' && bd.totalChildren === 0) {
		return `Update ${bd.brandName} brand details`;
	}

	// Brand itself was deleted
	if (bd.brandOp === 'delete') {
		return `Remove ${bd.brandName} brand`;
	}

	// Only variants changed, all under same filament
	if (a.variants.created.length + a.variants.updated.length + a.variants.deleted.length > 0) {
		const variantChanges = [...a.variants.created, ...a.variants.updated, ...a.variants.deleted];
		const filamentIds = new Set(variantChanges.map((c) => {
			const ep = parsePath(c.entity.path);
			return ep?.type === 'variant' ? `${ep.brandId}/${ep.materialType}/${ep.filamentId}` : '';
		}));

		if (filamentIds.size === 1 && a.filaments.created.length + a.filaments.updated.length + a.filaments.deleted.length <= 1 && a.materials.created.length + a.materials.updated.length + a.materials.deleted.length === 0) {
			const filamentChange = [...a.filaments.created, ...a.filaments.updated, ...a.filaments.deleted][0];
			const filamentName = filamentChange ? entityName(filamentChange) : getFilamentNameFromVariant(variantChanges[0]);
			const fullName = `${bd.brandName} ${filamentName}`;

			// All variants same operation
			const variantOps = new Set(variantChanges.map((c) => c.operation));
			if (variantOps.size === 1) {
				const op = variantChanges[0].operation;
				if (variantChanges.length === 1) {
					const variantName = entityName(variantChanges[0]);
					return `${opVerb(op)} ${variantName} variant to ${fullName}`;
				}
				return `${opVerb(op)} ${variantChanges.length} ${pluralize('variant', variantChanges.length)} ${op === 'create' ? 'to' : op === 'delete' ? 'from' : 'in'} ${fullName}`;
			}

			// Mixed variant operations
			if (filamentChange?.operation === 'create') {
				return `Add ${fullName} filament with ${variantChanges.length} ${pluralize('variant', variantChanges.length)}`;
			}
			return `Update ${fullName} variants`;
		}
	}

	// Only filaments changed (no variants)
	if (bd.filamentNames.length > 0 && bd.variantCount === 0 && a.materials.created.length + a.materials.updated.length + a.materials.deleted.length === 0) {
		const filamentChanges = [...a.filaments.created, ...a.filaments.updated, ...a.filaments.deleted];
		const filamentOps = new Set(filamentChanges.map((c) => c.operation));

		if (filamentOps.size === 1) {
			const op = filamentChanges[0].operation;
			const names = filamentChanges.map(entityName);
			return `${opVerb(op)} ${joinList(names)} ${pluralize('filament', names.length)} ${op === 'delete' ? 'from' : op === 'create' ? 'to' : 'in'} ${bd.brandName}`;
		}
	}

	// Only materials changed
	if (bd.materialNames.length > 0 && bd.filamentNames.length === 0 && bd.variantCount === 0) {
		const materialChanges = [...a.materials.created, ...a.materials.updated, ...a.materials.deleted];
		const matOps = new Set(materialChanges.map((c) => c.operation));
		if (matOps.size === 1) {
			const op = materialChanges[0].operation;
			return `${opVerb(op)} ${joinList(bd.materialNames)} ${pluralize('material', bd.materialNames.length)} ${op === 'create' ? 'to' : op === 'delete' ? 'from' : 'in'} ${bd.brandName}`;
		}
	}

	// Mix of children under one brand — summarize
	const parts: string[] = [];
	if (bd.brandOp === 'update') parts.push('update brand details');
	if (bd.filamentNames.length > 0) {
		const fCreated = a.filaments.created.length;
		const fUpdated = a.filaments.updated.length;
		const fDeleted = a.filaments.deleted.length;
		if (fCreated > 0) parts.push(`add ${fCreated} ${pluralize('filament', fCreated)}`);
		if (fUpdated > 0) parts.push(`update ${fUpdated} ${pluralize('filament', fUpdated)}`);
		if (fDeleted > 0) parts.push(`remove ${fDeleted} ${pluralize('filament', fDeleted)}`);
	}
	if (bd.variantCount > 0) {
		const vCreated = a.variants.created.length;
		const vUpdated = a.variants.updated.length;
		const vDeleted = a.variants.deleted.length;
		if (vCreated > 0) parts.push(`add ${vCreated} ${pluralize('variant', vCreated)}`);
		if (vUpdated > 0) parts.push(`update ${vUpdated} ${pluralize('variant', vUpdated)}`);
		if (vDeleted > 0) parts.push(`remove ${vDeleted} ${pluralize('variant', vDeleted)}`);
	}

	if (parts.length > 0) {
		const joined = joinList(parts, 3);
		// Capitalize first letter
		return `${bd.brandName}: ${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
	}

	return null;
}

/**
 * Multiple brands, all same operation.
 * e.g. "Add 3 new brands"
 */
function tryMultipleBrandsSameOpTitle(a: ChangeAnalysis, breakdowns: BrandBreakdown[]): string | null {
	if (breakdowns.length < 2) return null;

	// Check if all brand-level changes are the same op and no non-brand changes outside those brands
	const brandOps = new Set(breakdowns.map((b) => b.brandOp).filter(Boolean));
	if (brandOps.size !== 1) return null;

	const op = [...brandOps][0]! as 'create' | 'update' | 'delete';
	const brandNames = breakdowns.map((b) => b.brandName);

	if (breakdowns.length <= 3) {
		return `${opVerb(op)} ${joinList(brandNames)} ${pluralize('brand', breakdowns.length)}`;
	}
	return `${opVerb(op)} ${breakdowns.length} ${pluralize('brand', breakdowns.length)}`;
}

/**
 * All changes are the same operation type (across all entity types).
 * e.g. "Add 8 entities across 2 brands"
 */
function tryUniformOperationTitle(changes: EntityChange[], breakdowns: BrandBreakdown[]): string | null {
	const ops = new Set(changes.map((c) => c.operation));
	if (ops.size !== 1) return null;

	const op = changes[0].operation;
	const verb = opVerb(op);

	// Count distinct entity types involved
	const types = new Set(changes.map((c) => c.entity.type));

	if (types.size === 1) {
		const type = changes[0].entity.type;
		if (changes.length <= 3) {
			const names = changes.map(entityName);
			return `${verb} ${joinList(names)} ${pluralize(type, changes.length)}`;
		}
		if (breakdowns.length === 1) {
			return `${verb} ${changes.length} ${pluralize(type, changes.length)} in ${breakdowns[0].brandName}`;
		}
		return `${verb} ${changes.length} ${pluralize(type, changes.length)}`;
	}

	if (breakdowns.length === 1) {
		return `${verb} ${changes.length} changes in ${breakdowns[0].brandName}`;
	}

	return null;
}

/**
 * All deletions — discontinuation pattern.
 * e.g. "Remove discontinued filaments from Prusament and Bambu Lab"
 */
function tryDeletionTitle(a: ChangeAnalysis, changes: EntityChange[], breakdowns: BrandBreakdown[]): string | null {
	const allDeletes = changes.every((c) => c.operation === 'delete');
	if (!allDeletes) return null;

	const brandNames = breakdowns.map((b) => b.brandName);
	const types = new Set(changes.map((c) => c.entity.type));

	if (types.size === 1) {
		const type = changes[0].entity.type;
		if (brandNames.length > 0 && brandNames.length <= 3) {
			return `Remove ${changes.length} ${pluralize(type, changes.length)} from ${joinList(brandNames)}`;
		}
		return `Remove ${changes.length} ${pluralize(type, changes.length)}`;
	}

	if (brandNames.length === 1) {
		return `Remove ${changes.length} entities from ${brandNames[0]}`;
	}

	return `Remove ${changes.length} entities`;
}

/** Extract a filament name from a variant's path (best-effort). */
function getFilamentNameFromVariant(change: EntityChange): string {
	const ep = parsePath(change.entity.path);
	if (ep?.type === 'variant') return ep.filamentId;
	return 'unknown';
}

// ────────────────────────────────────────────────────────────────
// Mixed changes (brands + stores)
// ────────────────────────────────────────────────────────────────

function tryMixedBrandAndStoreTitle(a: ChangeAnalysis, breakdowns: BrandBreakdown[]): string | null {
	const storeTotal = a.stores.created.length + a.stores.updated.length + a.stores.deleted.length;
	if (storeTotal === 0 || breakdowns.length === 0) return null;

	const parts: string[] = [];

	// Brand part
	if (breakdowns.length === 1) {
		const bd = breakdowns[0];
		if (bd.brandOp === 'create') {
			parts.push(`add ${bd.brandName} brand`);
		} else {
			parts.push(`update ${bd.brandName}`);
		}
	} else {
		parts.push(`update ${breakdowns.length} brands`);
	}

	// Store part
	if (storeTotal === 1) {
		const storeChange = [...a.stores.created, ...a.stores.updated, ...a.stores.deleted][0];
		parts.push(`${opVerbPast(storeChange.operation)} ${entityName(storeChange)} store`);
	} else {
		parts.push(`update ${storeTotal} stores`);
	}

	const joined = parts.join(' and ');
	return joined.charAt(0).toUpperCase() + joined.slice(1);
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

/**
 * Generate a smart, descriptive title for a set of changes.
 *
 * Tries increasingly general strategies until one matches.
 * Always returns a usable string (never null).
 */
export function generateChangeTitle(changes: EntityChange[]): string {
	if (changes.length === 0) return 'No changes';

	const a = analyze(changes);
	const breakdowns = buildBrandBreakdowns(changes);

	// Try specific patterns first, then fall back to more generic ones.
	return (
		tryStoreOnlyTitle(a) ??
		trySingleNewBrandTitle(a, breakdowns) ??
		trySingleBrandTitle(a, breakdowns, changes) ??
		tryMultipleBrandsSameOpTitle(a, breakdowns) ??
		tryDeletionTitle(a, changes, breakdowns) ??
		tryMixedBrandAndStoreTitle(a, breakdowns) ??
		tryUniformOperationTitle(changes, breakdowns) ??
		buildFallbackTitle(a, changes, breakdowns)
	);
}

/** Last-resort fallback that always produces something useful. */
function buildFallbackTitle(a: ChangeAnalysis, changes: EntityChange[], breakdowns: BrandBreakdown[]): string {
	const parts: string[] = [];

	const addPart = (op: string, count: number, type: string) => {
		if (count > 0) parts.push(`${op} ${count} ${pluralize(type, count)}`);
	};

	addPart('add', a.brands.created.length, 'brand');
	addPart('update', a.brands.updated.length, 'brand');
	addPart('remove', a.brands.deleted.length, 'brand');
	addPart('add', a.filaments.created.length, 'filament');
	addPart('update', a.filaments.updated.length, 'filament');
	addPart('remove', a.filaments.deleted.length, 'filament');
	addPart('add', a.variants.created.length, 'variant');
	addPart('update', a.variants.updated.length, 'variant');
	addPart('remove', a.variants.deleted.length, 'variant');
	addPart('add', a.stores.created.length, 'store');
	addPart('update', a.stores.updated.length, 'store');
	addPart('remove', a.stores.deleted.length, 'store');

	if (parts.length === 0) {
		return `Update filament database (${changes.length} ${pluralize('change', changes.length)})`;
	}

	// Capitalize first entry, join with commas
	const joined = joinList(parts, 4);
	return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * Generate a short description (PR body first line) summarizing the changes.
 * Complements the title with extra detail.
 */
export function generateChangeDescription(changes: EntityChange[]): string {
	if (changes.length === 0) return '';

	const a = analyze(changes);
	const breakdowns = buildBrandBreakdowns(changes);

	const lines: string[] = [];

	// Brand summary
	for (const bd of breakdowns) {
		const parts: string[] = [];
		if (bd.brandOp === 'create') parts.push('new brand');
		else if (bd.brandOp === 'update') parts.push('updated brand details');
		if (bd.materialNames.length > 0) parts.push(`${bd.materialNames.length} ${pluralize('material', bd.materialNames.length)}`);
		if (bd.filamentNames.length > 0) parts.push(`${bd.filamentNames.length} ${pluralize('filament', bd.filamentNames.length)}`);
		if (bd.variantCount > 0) parts.push(`${bd.variantCount} ${pluralize('variant', bd.variantCount)}`);

		if (parts.length > 0) {
			lines.push(`**${bd.brandName}**: ${parts.join(', ')}`);
		}
	}

	// Store summary
	const storeChanges = [...a.stores.created, ...a.stores.updated, ...a.stores.deleted];
	if (storeChanges.length > 0) {
		const storeNames = storeChanges.map(entityName);
		lines.push(`**Stores**: ${joinList(storeNames)}`);
	}

	return lines.join('\n');
}
