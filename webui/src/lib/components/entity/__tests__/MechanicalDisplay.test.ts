import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { MechanicalProperty } from '$lib/types/database';
import MechanicalDisplay from '../MechanicalDisplay.svelte';

const SOURCE = {
	source_type: 'primary' as const,
	source_url: 'https://store.bblcdn.com/7166b20bc68f4c87b32c972b856eeb4b.pdf',
	retrieved: '2026-11-08'
};

const mechanical: MechanicalProperty[] = [
	{
		property: 'tensile_modulus',
		direction: 'XY',
		value: 3860,
		plus_minus: 230,
		unit: 'MPa',
		standard: 'ISO 527',
		...SOURCE,
		source_quote: "Young's Modulus (X-Y) ISO 527, GB/T 1040 3860 ± 230 MPa"
	},
	{
		property: 'tensile_modulus',
		direction: 'Z',
		value: 2350,
		plus_minus: 140,
		unit: 'MPa',
		standard: 'ISO 527',
		...SOURCE,
		source_quote: "Young's Modulus (Z) ISO 527, GB/T 1040 2350 ± 140 MPa"
	}
];

describe('MechanicalDisplay', () => {
	it('shows directions side by side, as published, linked to the source', () => {
		render(MechanicalDisplay, { mechanical });
		const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
		expect(headers).toEqual(['Property', 'XY', 'Z']);
		expect(screen.getAllByRole('row')).toHaveLength(2);
		const xy = screen.getByRole('link', { name: '3860 ± 230 MPa' });
		expect(xy.getAttribute('href')).toBe(SOURCE.source_url);
		expect(xy.getAttribute('title')).toContain('3860 ± 230 MPa');
		expect(screen.getByRole('link', { name: '2350 ± 140 MPa' })).toBeTruthy();
		expect(screen.getByText('ISO 527')).toBeTruthy();
	});

	it('lists one data sheet once under its sources', () => {
		render(MechanicalDisplay, { mechanical });
		expect(screen.getAllByRole('link', { name: SOURCE.source_url })).toHaveLength(1);
	});
});
