/**
 * Schema service for fetching and caching JSON schemas
 * Provides schema-driven descriptions and field metadata
 */

import { get } from 'svelte/store';
import { apiBaseUrl } from '$lib/stores/environment';

// Cache for fetched schemas
const schemaCache = new Map<string, any>();

/**
 * Fetch a schema from the API with caching
 */
export async function fetchSchema(schemaName: string): Promise<any | null> {
	if (schemaCache.has(schemaName)) {
		return schemaCache.get(schemaName);
	}

	try {
		const baseUrl = get(apiBaseUrl);
		const response = await fetch(`${baseUrl}/api/v1/schemas/${schemaName}`);
		if (!response.ok) {
			console.warn(`Failed to fetch schema ${schemaName}: ${response.status}`);
			return null;
		}
		const schema = await response.json();
		schemaCache.set(schemaName, schema);
		return schema;
	} catch (error) {
		console.error(`Error fetching schema ${schemaName}:`, error);
		return null;
	}
}

/**
 * Clear the schema cache (useful for development/testing)
 */
export function clearSchemaCache(): void {
	schemaCache.clear();
}

/**
 * Extract descriptions from schema properties
 * Returns a flat map of property names to descriptions
 */
export function extractSchemaDescriptions(schema: any, prefix: string = ''): Record<string, string> {
	const descriptions: Record<string, string> = {};

	if (!schema || typeof schema !== 'object') {
		return descriptions;
	}

	// Handle schema with properties
	if (schema.properties) {
		for (const [key, value] of Object.entries(schema.properties)) {
			const fullKey = prefix ? `${prefix}.${key}` : key;
			const prop = value as any;

			if (prop.description) {
				descriptions[fullKey] = prop.description;
				// Also store without prefix for easier lookup
				if (prefix) {
					descriptions[key] = prop.description;
				}
			}

			// Recursively extract from nested objects
			if (prop.type === 'object' && prop.properties) {
				Object.assign(descriptions, extractSchemaDescriptions(prop, fullKey));
			}

			// Handle arrays with item schemas
			if (prop.type === 'array' && prop.items) {
				Object.assign(descriptions, extractSchemaDescriptions(prop.items, fullKey));
			}
		}
	}

	// Handle definitions/defs
	if (schema.$defs) {
		for (const [defName, defValue] of Object.entries(schema.$defs)) {
			Object.assign(descriptions, extractSchemaDescriptions(defValue as any, defName));
		}
	}

	return descriptions;
}

/**
 * Extract enum values from a schema
 */
export function extractSchemaEnums(schema: any): Record<string, string[]> {
	const enums: Record<string, string[]> = {};

	if (!schema || typeof schema !== 'object') {
		return enums;
	}

	if (schema.properties) {
		for (const [key, value] of Object.entries(schema.properties)) {
			const prop = value as any;
			if (prop.enum && Array.isArray(prop.enum)) {
				enums[key] = prop.enum;
			}
		}
	}

	return enums;
}

/**
 * Get a description for a field from a schema
 * Falls back to provided fallback if not found
 */
export function getFieldDescription(
	schema: any,
	fieldPath: string,
	fallback: string = ''
): string {
	const descriptions = extractSchemaDescriptions(schema);
	return descriptions[fieldPath] || fallback;
}

/**
 * Extract trait definitions from the variant schema
 * The variant schema contains trait definitions in its properties
 */
export function extractTraitsFromSchema(schema: any): Record<string, { description: string }> {
	const traits: Record<string, { description: string }> = {};

	if (!schema?.properties) {
		return traits;
	}

	// Traits are boolean properties in the schema
	for (const [key, value] of Object.entries(schema.properties)) {
		const prop = value as any;
		// Identify traits by their boolean type and specific naming patterns
		if (prop.type === 'boolean' && prop.description) {
			// Common trait prefixes
			const traitPrefixes = [
				'translucent', 'transparent', 'matte', 'silk', 'glitter', 'iridescent',
				'pearlescent', 'neon', 'glow', 'without_pigments', 'temperature_color_change',
				'gradual_color_change', 'coextruded', 'illuminescent_color_change',
				'imitates_', 'lithophane', 'recycled', 'recyclable', 'biodegradable',
				'home_compostable', 'industrially_compostable', 'bio_based', 'abrasive',
				'foaming', 'castable', 'self_extinguishing', 'high_temperature',
				'low_outgassing', 'water_soluble', 'ipa_soluble', 'limonene_soluble',
				'esd_safe', 'conductive', 'emi_shielding', 'paramagnetic', 'biocompatible',
				'antibacterial', 'air_filtering', 'radiation_shielding', 'filtration_recommended',
				'blend', 'limited_edition', 'contains_'
			];

			const isTrait = traitPrefixes.some(prefix => key.startsWith(prefix) || key === prefix);
			if (isTrait) {
				traits[key] = { description: prop.description };
			}
		}
	}

	return traits;
}

/**
 * Schema names for different entity types
 */
export const SCHEMA_NAMES = {
	brand: 'brand_schema.json',
	material: 'material_schema.json',
	filament: 'filament_schema.json',
	variant: 'variant_schema.json',
	store: 'store_schema.json',
	materialTypes: 'material_types_schema.json'
} as const;

export type SchemaName = keyof typeof SCHEMA_NAMES;

/**
 * Fetch a schema by entity type
 */
export async function fetchEntitySchema(entityType: SchemaName): Promise<any | null> {
	return fetchSchema(SCHEMA_NAMES[entityType]);
}
