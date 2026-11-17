/**
 * Helpers for editing `sustainability` blocks and `container_details` against
 * schemas/sustainability_schema.json and schemas/sizes_schema.json.
 *
 * The editor is driven by the schema (enums, descriptions, required fields), so these
 * helpers only create blank entries and strip what the contributor left empty.
 */

import type { Sustainability } from '$lib/types/database';

/** The subset of JSON Schema the sustainability editor reads. */
export interface JsonSchema {
	type?: string | string[];
	title?: string;
	description?: string;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	required?: string[];
	enum?: Array<string | number>;
	default?: unknown;
	format?: string;
	minimum?: number;
	maximum?: number;
}

/**
 * One sourced entry. Its fields come from the schema at runtime, so values can be any
 * JSON type; the typed views are `RecycledContent`, `CarbonFootprint` etc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Entry = Record<string, any>;

/** Sections that hold one sourced object, and sections that hold a list of them. */
export const OBJECT_SECTIONS = ['recycled_content', 'bio_based_content'] as const;
export const ARRAY_SECTIONS = ['carbon_footprints', 'relative_claims'] as const;
export type SustainabilitySection =
	| (typeof OBJECT_SECTIONS)[number]
	| (typeof ARRAY_SECTIONS)[number];

/** The number in each section that the source quote must contain. */
export const VALUE_FIELDS: Record<SustainabilitySection | 'container_details', string[]> = {
	recycled_content: ['pct'],
	bio_based_content: ['pct'],
	carbon_footprints: ['value_kg_co2e'],
	relative_claims: ['reduction_pct'],
	container_details: ['recycled_pct']
};

export function schemaTypes(propSchema: JsonSchema | undefined): string[] {
	const t = propSchema?.type;
	return Array.isArray(t) ? t : t ? [t] : [];
}

/** The schema for one entry of a section (the object itself, or an array's items). */
export function entrySchema(
	sustainabilitySchema: JsonSchema | null | undefined,
	section: SustainabilitySection
): JsonSchema | undefined {
	const prop = sustainabilitySchema?.properties?.[section];
	return prop?.type === 'array' ? prop.items : prop;
}

/** "post_industrial" -> "Post industrial" */
export function enumLabel(value: string): string {
	const text = value.replace(/_/g, ' ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * A blank entry for `schema`. Unclear values start as "unknown" where the schema
 * allows it, so nothing is guessed on the contributor's behalf.
 */
export function newEntry(schema: JsonSchema | undefined, today: string = todayIso()): Entry {
	const entry: Entry = {};
	for (const [key, prop] of Object.entries(schema?.properties ?? {})) {
		if (prop.default !== undefined) entry[key] = prop.default;
		else if (Array.isArray(prop.enum) && prop.enum.includes('unknown')) entry[key] = 'unknown';
	}
	entry.source_type = 'primary';
	entry.retrieved = today;
	return entry;
}

/** Source fields `checkSourcedEntry` already reports when they are missing. */
const SOURCE_FIELDS = new Set(['source_url', 'source_quote', 'retrieved']);

/**
 * "<Title> is required." for each required field left unset (missing, blank or null),
 * so a dropdown still on "Choose…" is flagged before validation rejects the entry. A
 * field that may be null (e.g. `pct` when the source gives no number) is saved as null,
 * so it is never missing.
 */
export function missingRequired(
	entry: Entry | null | undefined,
	schema: JsonSchema | undefined
): string[] {
	const missing: string[] = [];
	for (const key of schema?.required ?? []) {
		const prop = schema?.properties?.[key];
		if (SOURCE_FIELDS.has(key) || schemaTypes(prop).includes('null')) continue;
		if (isEmpty(entry?.[key])) missing.push(`${prop?.title ?? enumLabel(key)} is required.`);
	}
	return missing;
}

function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(typeof value === 'number' && Number.isNaN(value)) ||
		(typeof value === 'string' && value.trim() === '') ||
		(Array.isArray(value) && value.length === 0)
	);
}

/**
 * Drop empty fields from one entry. A required field that may be null (e.g. `pct`
 * when the source gives no number) is kept as `null` rather than dropped.
 */
export function pruneEntry(entry: Entry, schema: JsonSchema | undefined): Entry {
	const required = new Set(schema?.required ?? []);
	const out: Entry = {};
	for (const [key, value] of Object.entries(entry ?? {})) {
		const prop = schema?.properties?.[key];
		if (!prop) continue;
		if (isEmpty(value)) {
			if (required.has(key) && schemaTypes(prop).includes('null')) out[key] = null;
			continue;
		}
		out[key] = typeof value === 'string' ? value.trim() : value;
	}
	for (const key of required) {
		if (!(key in out) && schemaTypes(schema?.properties?.[key]).includes('null')) out[key] = null;
	}
	return out;
}

/** Prune every section and drop the empty ones. Returns undefined when nothing is left. */
export function pruneSustainability(
	value: Sustainability | undefined,
	sustainabilitySchema: JsonSchema | null | undefined
): Sustainability | undefined {
	if (!value) return undefined;
	const out: Record<string, Entry | Entry[]> = {};
	for (const section of OBJECT_SECTIONS) {
		const entry = value[section];
		if (entry) out[section] = pruneEntry({ ...entry }, entrySchema(sustainabilitySchema, section));
	}
	for (const section of ARRAY_SECTIONS) {
		const entries = (value[section] ?? []).map((e) =>
			pruneEntry({ ...e }, entrySchema(sustainabilitySchema, section))
		);
		if (entries.length) out[section] = entries;
	}
	return Object.keys(out).length ? (out as unknown as Sustainability) : undefined;
}
