import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Harness from './SustainabilityEditorHarness.svelte';

const schema = JSON.parse(
	readFileSync(resolve(__dirname, '../../../../../../schemas/sustainability_schema.json'), 'utf-8')
);

describe('SustainabilityEditor', () => {
	it('adds a carbon footprint card when its button is pressed', async () => {
		render(Harness, { schema });
		const add = screen.getByRole('button', { name: /Carbon Footprints/ });
		await fireEvent.click(add);
		expect(screen.getByTestId('value').textContent).toContain('carbon_footprints');
		expect(screen.getByText(/Carbon Footprints 1/)).toBeTruthy();
		// The method dropdown starts on "Choose…", and says so before validation does.
		expect(screen.getByText('Method is required.')).toBeTruthy();
	});

	it('adds and removes a recycled content section', async () => {
		render(Harness, { schema });
		await fireEvent.click(screen.getByRole('button', { name: /Recycled Content/ }));
		expect(screen.getByTestId('value').textContent).toContain('recycled_content');
		await fireEvent.click(screen.getByTitle('Remove Recycled Content'));
		expect(screen.getByTestId('value').textContent).not.toContain('recycled_content');
	});
});

describe('SourcedEntryFields', () => {
	it('renders container details with no URL or certifications yet', async () => {
		const { default: SourcedEntryFields } = await import('../SourcedEntryFields.svelte');
		const sizes = JSON.parse(
			readFileSync(resolve(__dirname, '../../../../../../schemas/sizes_schema.json'), 'utf-8')
		);
		render(SourcedEntryFields, {
			entry: { source_type: 'primary', retrieved: '2026-10-26' },
			schema: sizes.items.properties.container_details,
			idPrefix: 'size-1-container',
			valueFields: ['recycled_pct']
		});
		expect(screen.getByText('Certifications')).toBeTruthy();
	});
});
