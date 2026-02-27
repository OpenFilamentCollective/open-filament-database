/**
 * Shared slicer configuration used by MaterialForm and FilamentForm
 */

import { createForm, getValueSnapshot } from '@sjsf/form';
import { formDefaults } from '$lib/utils/formDefaults';
import { applyFormattedTitles } from '$lib/utils/schemaUtils';
import { customTranslation } from '$lib/utils/translations';

export const SLICER_KEYS = ['prusaslicer', 'bambustudio', 'orcaslicer', 'cura', 'generic'] as const;
export type SlicerKey = (typeof SLICER_KEYS)[number];

export const SLICER_LABELS: Record<SlicerKey, string> = {
	prusaslicer: 'PrusaSlicer',
	bambustudio: 'Bambu Studio',
	orcaslicer: 'Orca Slicer',
	cura: 'Cura',
	generic: 'Generic'
};

export const SLICER_DESCRIPTIONS: Record<SlicerKey, string> = {
	prusaslicer:
		'Settings for PrusaSlicer and derivatives. Profile name references built-in or custom profiles.',
	bambustudio: 'Settings for Bambu Studio. Compatible with Bambu Lab printers and X1/P1 series.',
	orcaslicer: 'Settings for Orca Slicer. Fork of Bambu Studio with extended features.',
	cura: 'Settings for Ultimaker Cura. Uses Cura profile naming conventions.',
	generic: 'Generic temperature settings that apply across all slicers without profile references.'
};

/**
 * Create schema for slicer settings
 * @param isGeneric - If true, creates a simpler schema without profile_name
 */
export function createSlicerSettingsSchema(isGeneric: boolean) {
	const baseProperties: Record<string, any> = {
		first_layer_bed_temp: { type: 'integer', title: 'First Layer Bed Temp' },
		first_layer_nozzle_temp: { type: 'integer', title: 'First Layer Nozzle Temp' },
		bed_temp: { type: 'integer', title: 'Bed Temp' },
		nozzle_temp: { type: 'integer', title: 'Nozzle Temp' }
	};

	if (!isGeneric) {
		return {
			type: 'object',
			properties: {
				profile_name: {
					type: 'string',
					title: 'Profile Name',
					description: 'The name of the profile for this filament'
				},
				overrides: {
					type: 'object',
					title: 'Overrides',
					additionalProperties: true,
					description: 'Key-value pairs for settings that should be overridden'
				},
				...baseProperties
			},
			required: ['profile_name']
		};
	}

	return {
		type: 'object',
		properties: baseProperties
	};
}

/**
 * Initialize a slicer form with the given key and initial value
 */
export function initializeSlicerForm(key: SlicerKey, initialValue: any = {}) {
	const isGeneric = key === 'generic';
	const schema = createSlicerSettingsSchema(isGeneric);

	return createForm({
		...formDefaults,
		schema: applyFormattedTitles(schema),
		uiSchema: {
			'ui:options': {
				submitButton: { class: 'hidden' }
			}
		},
		translation: customTranslation,
		initialValue,
		onSubmit: () => {} // Submission is handled by parent form
	} as any);
}

/**
 * Get the current value snapshot from a slicer form
 */
export function getSlicerData(form: any): any {
	if (!form) return undefined;
	return getValueSnapshot(form);
}

/**
 * Build slicer settings object from enabled slicers and their forms
 */
export function buildSlicerSettings(
	slicerEnabled: Record<SlicerKey, boolean>,
	slicerForms: Record<SlicerKey, any>
): Record<string, any> {
	const settings: Record<string, any> = {};

	for (const key of SLICER_KEYS) {
		if (!slicerEnabled[key] || !slicerForms[key]) continue;

		const data = getSlicerData(slicerForms[key]);
		if (data && Object.keys(data).length > 0) {
			// Only include if there's actual data
			const hasData = Object.values(data).some((v) => v !== undefined && v !== '' && v !== null);
			if (hasData) {
				settings[key] = data;
			}
		}
	}

	return settings;
}

/**
 * Initialize slicer enabled state from existing data
 */
export function initializeSlicerEnabled(existingSettings?: Record<string, any>): Record<SlicerKey, boolean> {
	return {
		prusaslicer: !!existingSettings?.prusaslicer,
		bambustudio: !!existingSettings?.bambustudio,
		orcaslicer: !!existingSettings?.orcaslicer,
		cura: !!existingSettings?.cura,
		generic: !!existingSettings?.generic
	};
}

/**
 * Initialize empty slicer forms record
 */
export function initializeSlicerForms(): Record<SlicerKey, any> {
	return {
		prusaslicer: null,
		bambustudio: null,
		orcaslicer: null,
		cura: null,
		generic: null
	};
}
