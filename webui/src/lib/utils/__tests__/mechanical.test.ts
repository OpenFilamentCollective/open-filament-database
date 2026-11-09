import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MechanicalProperty } from '$lib/types/database';
import {
	formatMechanicalValue,
	groupMechanical,
	newMechanicalEntry,
	pruneMechanical,
	specimenSummary,
	valueFieldsSchema
} from '../mechanical';

// The real schema, so these tests break if the schema and the editor drift apart.
const schema = JSON.parse(
	readFileSync(resolve(__dirname, '../../../../../schemas/mechanical_schema.json'), 'utf-8')
);

const SOURCE = {
	source_type: 'primary' as const,
	source_url: 'https://store.bblcdn.com/7166b20bc68f4c87b32c972b856eeb4b.pdf',
	source_quote: 'quote',
	retrieved: '2026-11-08'
};

function value(fields: Partial<MechanicalProperty>): MechanicalProperty {
	return {
		property: 'tensile_modulus',
		direction: 'XY',
		value: 3860,
		unit: 'MPa',
		...SOURCE,
		...fields
	};
}

describe('newMechanicalEntry', () => {
	it('starts the direction as unknown and guesses no value or unit', () => {
		const entry = newMechanicalEntry(schema, '2026-11-09');
		expect(entry.direction).toBe('unknown');
		expect(entry.source_type).toBe('primary');
		expect(entry.retrieved).toBe('2026-11-09');
		expect(entry.value).toBeUndefined();
		expect(entry.unit).toBeUndefined();
		expect(entry.property).toBeUndefined();
	});
});

describe('valueFieldsSchema', () => {
	it('leaves specimen out of the flat fields', () => {
		const fields = valueFieldsSchema(schema);
		expect(fields?.properties?.specimen).toBeUndefined();
		expect(fields?.properties?.source_quote).toBeDefined();
		expect(fields?.required).toContain('value');
	});
});

describe('pruneMechanical', () => {
	it('returns undefined for no entries', () => {
		expect(pruneMechanical([], schema)).toBeUndefined();
		expect(pruneMechanical(undefined, schema)).toBeUndefined();
	});

	it('drops empty fields and an empty specimen', () => {
		const out = pruneMechanical(
			[{ ...value({}), plus_minus: null, standard: ' ', notes: '', specimen: { printer: '' } }],
			schema
		);
		expect(out).toEqual([value({})]);
	});

	it('keeps what the specimen states and drops keys the schema does not know', () => {
		const out = pruneMechanical(
			[
				{
					...value({}),
					specimen: { process: 'printed', infill_percent: 100, layer_height: null },
					avg: 1
				}
			],
			schema
		);
		expect(out?.[0].specimen).toEqual({ process: 'printed', infill_percent: 100 });
		expect(out?.[0]).not.toHaveProperty('avg');
	});
});

describe('formatMechanicalValue', () => {
	it('shows the value as published, with spread and unit', () => {
		expect(formatMechanicalValue(value({ plus_minus: 230 }))).toBe('3860 ± 230 MPa');
		expect(formatMechanicalValue(value({ value: 7250, unit: 'psi' }))).toBe('7250 psi');
		expect(formatMechanicalValue(value({ value: 4.5, unit: '%' }))).toBe('4.5%');
		expect(formatMechanicalValue(value({ value: 26.6, unit: 'kJ/m2' }))).toBe('26.6 kJ/m²');
	});
});

describe('groupMechanical', () => {
	it('puts directions side by side in one row per property, standard and condition', () => {
		const { rows, directions } = groupMechanical([
			value({ property: 'tensile_strength', direction: 'Z', value: 13 }),
			value({ direction: 'Z', value: 2350 }),
			value({}),
			value({ property: 'tensile_strength', direction: 'XY', value: 35, condition: 'conditioned' })
		]);
		expect(directions).toEqual(['XY', 'Z']);
		expect(rows.map((r) => [r.property, r.condition])).toEqual([
			['tensile_modulus', undefined],
			['tensile_strength', undefined],
			['tensile_strength', 'conditioned']
		]);
		expect(rows[0].cells.XY?.[0].value).toBe(3860);
		expect(rows[0].cells.Z?.[0].value).toBe(2350);
	});

	it('keeps a separate row per standard', () => {
		const { rows } = groupMechanical([
			value({ standard: 'ISO 527' }),
			value({ standard: 'ASTM D638' })
		]);
		expect(rows).toHaveLength(2);
	});
});

describe('specimenSummary', () => {
	it('lists only what the source states', () => {
		expect(specimenSummary(undefined)).toBe('');
		expect(specimenSummary({ process: 'unknown' })).toBe('');
		expect(
			specimenSummary({ process: 'printed', infill_percent: 100, layer_height: 0.2, printer: null })
		).toBe('Printed bars · 0.2 mm layers · 100% infill');
	});
});
