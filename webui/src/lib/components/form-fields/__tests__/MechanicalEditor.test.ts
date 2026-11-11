import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Harness from './MechanicalEditorHarness.svelte';

const schema = JSON.parse(
	readFileSync(resolve(__dirname, '../../../../../../schemas/mechanical_schema.json'), 'utf-8')
);

const MODULUS = {
	property: 'tensile_modulus',
	direction: 'XY',
	value: 3860,
	plus_minus: 230,
	unit: 'MPa',
	standard: 'ISO 527',
	source_type: 'primary',
	source_url: 'https://store.bblcdn.com/7166b20bc68f4c87b32c972b856eeb4b.pdf',
	source_quote: "Young's Modulus (X-Y) ISO 527, GB/T 1040 3860 ± 230 MPa",
	retrieved: '2026-11-08'
};

function value(): unknown[] {
	return JSON.parse(screen.getByTestId('value').textContent ?? '[]');
}

describe('MechanicalEditor', () => {
	it('adds and removes an entry', async () => {
		render(Harness, { schema });
		await fireEvent.click(screen.getByRole('button', { name: /Mechanical Property/ }));
		expect(value()).toHaveLength(1);
		expect(value()[0]).toMatchObject({ direction: 'unknown', source_type: 'primary' });
		await fireEvent.click(screen.getByTitle('Remove entry 1'));
		expect(value()).toEqual([]);
	});

	it('leaves property and unit unchosen on a new entry until the contributor picks', async () => {
		render(Harness, { schema });
		await fireEvent.click(screen.getByRole('button', { name: /Mechanical Property/ }));
		expect(value()[0]).not.toHaveProperty('property');
		expect(value()[0]).not.toHaveProperty('unit');
		expect(screen.getByText('Property is required.')).toBeTruthy();
		expect(screen.getByText('Unit is required.')).toBeTruthy();
		const unit = document.getElementById('mechanical-0-unit') as HTMLSelectElement;
		expect(unit.selectedOptions[0].textContent?.trim()).toBe('Choose…');
		unit.value = 'psi';
		await fireEvent.change(unit);
		expect(value()[0]).toMatchObject({ unit: 'psi' });
		expect(unit.value).toBe('psi');
		expect(screen.queryByText('Unit is required.')).toBeNull();
	});

	it('labels the card by property and direction, and units as published', () => {
		render(Harness, { schema, initial: [{ ...MODULUS }] });
		expect(screen.getByText(/1\. Tensile modulus/)).toBeTruthy();
		expect(screen.getByRole('option', { name: 'psi' })).toBeTruthy();
		expect(screen.getByRole('option', { name: 'Heat deflection (1.8 MPa)' })).toBeTruthy();
		expect(screen.queryByText(/does not contain/)).toBeNull();
	});

	it('shows a unit that does not fit the property', () => {
		render(Harness, { schema, initial: [{ ...MODULUS, property: 'elongation_at_break' }] });
		expect(screen.getByText(/MPa is not a unit for elongation_at_break/)).toBeTruthy();
	});

	it('warns about a duplicate entry', () => {
		render(Harness, { schema, initial: [{ ...MODULUS }, { ...MODULUS }] });
		expect(screen.getByText(/Entry 1 already has this property/)).toBeTruthy();
	});

	it('does not count entries with different specimens as duplicates', () => {
		render(Harness, {
			schema,
			initial: [
				{ ...MODULUS, specimen: { infill_percent: 100 } },
				{ ...MODULUS, specimen: { infill_percent: 20 } }
			]
		});
		expect(screen.queryByText(/already has this property/)).toBeNull();
	});

	it('adds specimen details on request', async () => {
		render(Harness, { schema, initial: [{ ...MODULUS }] });
		expect(screen.queryByText('Infill %')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /Specimen/ }));
		expect(screen.getByText('Infill %')).toBeTruthy();
		expect(value()[0]).toHaveProperty('specimen');
		// The specimen carries no source of its own, so no source errors appear for it.
		expect(screen.queryByText(/Missing source_url/)).toBeNull();
	});
});
