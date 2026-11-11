/**
 * Helpers for a filament's `mechanical` list (schemas/mechanical_schema.json): one
 * sourced value per property, print direction and condition, copied from the maker's
 * data sheet in the unit it is published in.
 *
 * The editor reuses the sustainability helpers for blank entries and pruning; these add
 * the nested `specimen` object and the grouping the read-only table needs.
 */

import type {
	MechanicalProperty,
	MechanicalPropertyName,
	MechanicalSpecimen,
	PrintDirection
} from '$lib/types/database';
import { enumLabel, newEntry, pruneEntry, type Entry, type JsonSchema } from './sustainability';

/** Property labels, in the schema's enum order, which is also the table's row order. */
export const PROPERTY_LABELS: Record<MechanicalPropertyName, string> = {
	tensile_modulus: 'Tensile modulus',
	tensile_strength: 'Tensile strength',
	yield_strength: 'Yield strength',
	elongation_at_break: 'Elongation at break',
	flexural_modulus: 'Flexural modulus',
	flexural_strength: 'Flexural strength',
	impact_strength: 'Impact strength',
	impact_strength_notched: 'Notched impact strength',
	heat_deflection_045: 'Heat deflection (0.45 MPa)',
	heat_deflection_18: 'Heat deflection (1.8 MPa)',
	vicat_softening: 'Vicat softening'
};

export const DIRECTIONS: PrintDirection[] = ['XY', 'XZ', 'Z', 'unknown'];

/** Option labels for the editor's selects: units stay exactly as published. */
export const OPTION_LABELS: Record<string, Record<string, string>> = {
	property: PROPERTY_LABELS,
	direction: { unknown: 'Not stated' },
	unit: { psi: 'psi', ksi: 'ksi' }
};

export function propertyLabel(property: string | undefined): string {
	return PROPERTY_LABELS[property as MechanicalPropertyName] ?? property ?? '';
}

/** "3860 ± 230 MPa", "4.5%" */
export function formatMechanicalValue(
	entry: Pick<MechanicalProperty, 'value' | 'plus_minus' | 'unit'>
): string {
	const spread = typeof entry.plus_minus === 'number' ? ` ± ${entry.plus_minus}` : '';
	const unit = entry.unit === 'kJ/m2' ? 'kJ/m²' : entry.unit;
	return `${entry.value}${spread}${unit === '%' ? '' : ' '}${unit}`;
}

/** The schema of one entry. */
export function itemSchema(
	mechanicalSchema: JsonSchema | null | undefined
): JsonSchema | undefined {
	return mechanicalSchema?.items;
}

/** The entry schema without `specimen`, which the editor renders as its own block. */
export function valueFieldsSchema(
	mechanicalSchema: JsonSchema | null | undefined
): JsonSchema | undefined {
	const item = itemSchema(mechanicalSchema);
	if (!item) return undefined;
	const properties = Object.entries(item.properties ?? {}).filter(([key]) => key !== 'specimen');
	return { ...item, properties: Object.fromEntries(properties) };
}

export function specimenSchema(
	mechanicalSchema: JsonSchema | null | undefined
): JsonSchema | undefined {
	return itemSchema(mechanicalSchema)?.properties?.specimen;
}

/** A blank entry. Direction starts as "unknown", so nothing is guessed. */
export function newMechanicalEntry(
	mechanicalSchema: JsonSchema | null | undefined,
	today?: string
): Entry {
	return newEntry(itemSchema(mechanicalSchema), today);
}

/**
 * True when a pruned entry holds nothing beyond what a blank entry starts with (any
 * retrieved date counts as a default), i.e. it was added and never filled in.
 */
function isUntouched(entry: Entry, blank: Entry): boolean {
	return Object.entries(entry).every(
		([key, value]) => key in blank && (key === 'retrieved' || value === blank[key])
	);
}

/**
 * Prune every entry and its specimen, dropping a specimen left empty and an entry never
 * filled in, so a stray "+ Mechanical Property" click cannot fail the save. Returns
 * undefined when no entries are left, so a removed list is wiped on save.
 */
export function pruneMechanical(
	value: Entry[] | undefined,
	mechanicalSchema: JsonSchema | null | undefined
): MechanicalProperty[] | undefined {
	const blank = newMechanicalEntry(mechanicalSchema);
	const entries = (value ?? [])
		.map((entry) => {
			const out = pruneEntry({ ...entry }, itemSchema(mechanicalSchema));
			if (out.specimen) {
				const specimen = pruneEntry({ ...out.specimen }, specimenSchema(mechanicalSchema));
				if (Object.keys(specimen).length) out.specimen = specimen;
				else delete out.specimen;
			}
			return out;
		})
		.filter((entry) => !isUntouched(entry, blank));
	return entries.length ? (entries as MechanicalProperty[]) : undefined;
}

/** One table row: a property under one standard and condition, by print direction. */
export interface MechanicalRow {
	property: string;
	standard?: string | null;
	condition?: string;
	cells: Partial<Record<PrintDirection, MechanicalProperty[]>>;
}

/**
 * Rows for the read-only table, in the schema's property order, plus the directions
 * that have any value (XY, XZ, Z, then unknown).
 */
export function groupMechanical(entries: MechanicalProperty[] | undefined): {
	rows: MechanicalRow[];
	directions: PrintDirection[];
} {
	const order = Object.keys(PROPERTY_LABELS);
	const sorted = [...(entries ?? [])].sort((a, b) => {
		const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
		return rank(a.property) - rank(b.property);
	});

	const rows = new Map<string, MechanicalRow>();
	const used = new Set<PrintDirection>();
	for (const entry of sorted) {
		const key = JSON.stringify([entry.property, entry.standard ?? null, entry.condition ?? null]);
		let row = rows.get(key);
		if (!row) {
			row = {
				property: entry.property,
				standard: entry.standard,
				condition: entry.condition,
				cells: {}
			};
			rows.set(key, row);
		}
		const direction = DIRECTIONS.includes(entry.direction) ? entry.direction : 'unknown';
		(row.cells[direction] ??= []).push(entry);
		used.add(direction);
	}
	return { rows: [...rows.values()], directions: DIRECTIONS.filter((d) => used.has(d)) };
}

/** "Printed bars · Bambu Lab X1C · 0.4 mm nozzle · 100% infill" */
export function specimenSummary(specimen: MechanicalSpecimen | undefined): string {
	if (!specimen) return '';
	const s = specimen;
	const set = (v: unknown) => v !== null && v !== undefined && v !== '';
	return [
		s.process && s.process !== 'unknown' ? `${enumLabel(s.process)} bars` : null,
		s.printer,
		set(s.nozzle_diameter) ? `${s.nozzle_diameter} mm nozzle` : null,
		set(s.layer_height) ? `${s.layer_height} mm layers` : null,
		set(s.infill_percent) ? `${s.infill_percent}% infill` : null,
		set(s.perimeters) ? `${s.perimeters} perimeters` : null,
		s.raster_angle ? `raster ${s.raster_angle}` : null,
		set(s.print_temperature) ? `nozzle ${s.print_temperature} °C` : null,
		set(s.bed_temperature) ? `bed ${s.bed_temperature} °C` : null,
		set(s.chamber_temperature) ? `chamber ${s.chamber_temperature} °C` : null,
		set(s.print_speed) ? `${s.print_speed} mm/s` : null,
		s.conditioning
	]
		.filter(Boolean)
		.join(' · ');
}
