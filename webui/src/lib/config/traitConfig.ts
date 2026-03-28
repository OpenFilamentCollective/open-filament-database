/**
 * Trait configuration for filament variants.
 * Derived from the variant JSON schema via API (x-category, x-label fields).
 */

import { fetchEntitySchema } from '$lib/services/schemaService';

export interface TraitDefinition {
	key: string;
	label: string;
	description: string;
}

export interface TraitCategory {
	label: string;
	traits: TraitDefinition[];
}

/**
 * Build trait categories from a variant schema object.
 * Reads x-category, x-label, and description from each trait property.
 */
export function buildTraitCategories(schema: any): Record<string, TraitCategory> {
	const categoryLabels: Record<string, string> = schema['x-trait-categories'] || {};
	const traitProps = schema?.properties?.traits?.properties || {};

	const categories: Record<string, TraitCategory> = {};

	// Initialize categories in schema-defined order
	for (const [catKey, catLabel] of Object.entries(categoryLabels)) {
		categories[catKey] = { label: catLabel as string, traits: [] };
	}

	// Assign traits to categories
	for (const [key, value] of Object.entries(traitProps)) {
		const prop = value as any;
		if (prop.type !== 'boolean') continue;

		const category = prop['x-category'] || 'other';
		const label = prop['x-label'] || key;
		const description = prop.description || '';

		if (!categories[category]) {
			categories[category] = { label: category, traits: [] };
		}

		categories[category].traits.push({ key, label, description });
	}

	return categories;
}

// Module-level cache populated by loadTraitConfig()
let _categories: Record<string, TraitCategory> = {};
let _loaded = false;

/**
 * Load trait configuration from the variant schema API.
 * Must be called once before using sync accessors.
 * Safe to call multiple times (cached after first load).
 */
export async function loadTraitConfig(): Promise<void> {
	if (_loaded) return;
	const schema = await fetchEntitySchema('variant');
	if (schema) {
		_categories = buildTraitCategories(schema);
		_loaded = true;
	}
}

/** Trait categories derived from the variant schema. Call loadTraitConfig() first. */
export function getTraitCategories(): Record<string, TraitCategory> {
	return _categories;
}

/**
 * @deprecated Use getTraitCategories() instead. Kept for backward compatibility.
 * Returns the cached categories (empty until loadTraitConfig() completes).
 */
export const TRAIT_CATEGORIES: Record<string, TraitCategory> = new Proxy({} as Record<string, TraitCategory>, {
	get(_, prop) {
		return _categories[prop as string];
	},
	ownKeys() {
		return Object.keys(_categories);
	},
	getOwnPropertyDescriptor(_, prop) {
		if (prop in _categories) {
			return { configurable: true, enumerable: true, value: _categories[prop as string] };
		}
		return undefined;
	},
	has(_, prop) {
		return prop in _categories;
	}
});

/**
 * Get all traits as a flat array
 */
export function getAllTraits(): TraitDefinition[] {
	return Object.values(_categories).flatMap((c) => c.traits);
}

/**
 * Find a trait by its key
 */
export function findTraitByKey(key: string): TraitDefinition | undefined {
	return getAllTraits().find((t) => t.key === key);
}

/**
 * Get the label for a trait key
 */
export function getTraitLabel(key: string): string {
	const trait = findTraitByKey(key);
	return trait?.label || key;
}

/**
 * Get the description for a trait key
 */
export function getTraitDescription(key: string): string {
	const trait = findTraitByKey(key);
	return trait?.description || '';
}
