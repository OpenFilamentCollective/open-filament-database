/**
 * Shared slicer configuration derived from the filament JSON schema via API.
 * Slicer keys, labels, and descriptions are extracted from
 * definitions.slicer_settings.properties (x-label, x-description fields).
 */

import { createForm, getValueSnapshot } from '@sjsf/form';
import { formDefaults } from '$lib/utils/formDefaults';
import { applyFormattedTitles } from '$lib/utils/schemaUtils';
import { customTranslation } from '$lib/utils/translations';
import { fetchEntitySchema } from '$lib/services/schemaService';

// --- Module-level cache populated by loadSlicerConfig() ---

let _slicerKeys: string[] = [];
let _slicerLabels: Record<string, string> = {};
let _slicerDescriptions: Record<string, string> = {};
let _loaded = false;

export type SlicerKey = string;

/**
 * Extract slicer configuration from a filament schema object.
 */
export function buildSlicerConfig(schema: any): {
	keys: string[];
	labels: Record<string, string>;
	descriptions: Record<string, string>;
} {
	const slicerProps = schema?.definitions?.slicer_settings?.properties || {};
	const keys: string[] = [];
	const labels: Record<string, string> = {};
	const descriptions: Record<string, string> = {};

	for (const [key, value] of Object.entries(slicerProps)) {
		const prop = value as any;
		keys.push(key);
		labels[key] = prop['x-label'] || key;
		descriptions[key] = prop['x-description'] || prop.description || '';
	}

	return { keys, labels, descriptions };
}

/**
 * Load slicer configuration from the filament schema API.
 * Must be called once before using sync accessors.
 * Safe to call multiple times (cached after first load).
 */
export async function loadSlicerConfig(): Promise<void> {
	if (_loaded) return;
	const schema = await fetchEntitySchema('filament');
	if (schema) {
		const config = buildSlicerConfig(schema);
		_slicerKeys = config.keys;
		_slicerLabels = config.labels;
		_slicerDescriptions = config.descriptions;
		_loaded = true;
	}
}

/** Get slicer keys. Call loadSlicerConfig() first. */
export function getSlicerKeys(): string[] {
	return _slicerKeys;
}

/** Get slicer labels map. Call loadSlicerConfig() first. */
export function getSlicerLabels(): Record<string, string> {
	return _slicerLabels;
}

/** Get slicer descriptions map. Call loadSlicerConfig() first. */
export function getSlicerDescriptions(): Record<string, string> {
	return _slicerDescriptions;
}

// --- Backward-compatible proxied exports ---
// These read from the module cache so existing consumers work without changes.

export const SLICER_KEYS: readonly string[] = new Proxy([] as string[], {
	get(target, prop) {
		if (prop === 'length') return _slicerKeys.length;
		if (prop === Symbol.iterator) return () => _slicerKeys[Symbol.iterator]();
		if (typeof prop === 'string' && !isNaN(Number(prop))) return _slicerKeys[Number(prop)];
		if (prop === 'some') return _slicerKeys.some.bind(_slicerKeys);
		if (prop === 'map') return _slicerKeys.map.bind(_slicerKeys);
		if (prop === 'filter') return _slicerKeys.filter.bind(_slicerKeys);
		if (prop === 'forEach') return _slicerKeys.forEach.bind(_slicerKeys);
		if (prop === 'includes') return _slicerKeys.includes.bind(_slicerKeys);
		return (target as any)[prop];
	}
});

export const SLICER_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
	get(_, prop) {
		return _slicerLabels[prop as string];
	},
	ownKeys() {
		return Object.keys(_slicerLabels);
	},
	getOwnPropertyDescriptor(_, prop) {
		if (prop in _slicerLabels) {
			return { configurable: true, enumerable: true, value: _slicerLabels[prop as string] };
		}
		return undefined;
	},
	has(_, prop) {
		return prop in _slicerLabels;
	}
});

export const SLICER_DESCRIPTIONS: Record<string, string> = new Proxy({} as Record<string, string>, {
	get(_, prop) {
		return _slicerDescriptions[prop as string];
	},
	ownKeys() {
		return Object.keys(_slicerDescriptions);
	},
	getOwnPropertyDescriptor(_, prop) {
		if (prop in _slicerDescriptions) {
			return { configurable: true, enumerable: true, value: _slicerDescriptions[prop as string] };
		}
		return undefined;
	},
	has(_, prop) {
		return prop in _slicerDescriptions;
	}
});

// --- Form utilities (unchanged) ---

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

	for (const key of _slicerKeys) {
		if (!slicerEnabled[key] || !slicerForms[key]) continue;

		const data = getSlicerData(slicerForms[key]);
		if (data && Object.keys(data).length > 0) {
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
	const enabled: Record<string, boolean> = {};
	for (const key of _slicerKeys) {
		enabled[key] = !!existingSettings?.[key];
	}
	return enabled;
}

/**
 * Initialize empty slicer forms record
 */
export function initializeSlicerForms(): Record<SlicerKey, any> {
	const forms: Record<string, any> = {};
	for (const key of _slicerKeys) {
		forms[key] = null;
	}
	return forms;
}
