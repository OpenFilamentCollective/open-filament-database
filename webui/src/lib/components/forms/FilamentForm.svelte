<script lang="ts">
	import {
		TextField,
		NumberField,
		CheckboxField,
		FormFieldRow,
		FormSection,
		TwoColumnLayout,
		TagInput
	} from '$lib/components/form-fields';
	import { SlicerConfigPanel } from '$lib/components/forms';
	import {
		SLICER_KEYS,
		initializeSlicerForm,
		buildSlicerSettings,
		initializeSlicerEnabled,
		initializeSlicerForms,
		type SlicerKey
	} from '$lib/config/slicerConfig';
	import { buildOptionalFields } from '$lib/utils/formUtils';
	import { BTN_SUBMIT } from '$lib/styles/formStyles';

	interface Props {
		filament?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
	}

	let { filament = null, onSubmit, saving = false }: Props = $props();

	// Tooltip descriptions
	const TOOLTIPS: Record<string, string> = {
		name: 'The manufacturer\'s name for this filament (e.g., "PolyLite PLA").',
		density: 'The density of the filament in g/cm³. Used for weight calculations. Default PLA: ~1.24.',
		diameter_tolerance: 'The diameter tolerance in mm (e.g., ±0.02).',
		min_print_temperature: 'Minimum recommended nozzle temperature for printing (°C).',
		max_print_temperature: 'Maximum recommended nozzle temperature for printing (°C).',
		min_bed_temperature: 'Minimum recommended bed temperature (°C).',
		max_bed_temperature: 'Maximum recommended bed temperature (°C).',
		preheat_temperature: 'Recommended nozzle temperature for preheating/load cell bed leveling (°C).',
		max_dry_temperature: 'Maximum temperature (°C) for drying without degradation.',
		shore_hardness_a: 'Hardness on Shore A scale (for flexible materials, typically 20-95).',
		shore_hardness_d: 'Hardness on Shore D scale (for rigid materials, typically 20-90).',
		min_nozzle_diameter: 'Minimum nozzle diameter recommended for this material (mm).',
		certifications: 'Certifications the material has (e.g., food-safe, medical-grade).',
		data_sheet_url: "URL to the manufacturer's technical data sheet.",
		safety_sheet_url: 'URL to the safety data sheet (SDS/MSDS).',
		discontinued: 'Mark if this filament has been discontinued by the manufacturer.',
		slicer_settings: 'Configure slicer profiles and temperature overrides for different slicing software.'
	};

	// Form data state
	let formData = $state({
		name: filament?.name || '',
		density: filament?.density ?? 1.24,
		diameter_tolerance: filament?.diameter_tolerance ?? 0.02,
		min_print_temperature: filament?.min_print_temperature || undefined,
		max_print_temperature: filament?.max_print_temperature || undefined,
		min_bed_temperature: filament?.min_bed_temperature || undefined,
		max_bed_temperature: filament?.max_bed_temperature || undefined,
		preheat_temperature: filament?.preheat_temperature || undefined,
		max_dry_temperature: filament?.max_dry_temperature || undefined,
		shore_hardness_a: filament?.shore_hardness_a || undefined,
		shore_hardness_d: filament?.shore_hardness_d || undefined,
		min_nozzle_diameter: filament?.min_nozzle_diameter || undefined,
		certifications: filament?.certifications || [],
		data_sheet_url: filament?.data_sheet_url || '',
		safety_sheet_url: filament?.safety_sheet_url || '',
		discontinued: filament?.discontinued || false,
		slicer_settings: filament?.slicer_settings || {}
	});

	// Slicer toggle state
	let slicerEnabled = $state<Record<SlicerKey, boolean>>(initializeSlicerEnabled(filament?.slicer_settings));

	// Slicer settings forms
	let slicerForms = $state<Record<SlicerKey, any>>(initializeSlicerForms());

	// Toggle slicer
	function toggleSlicer(key: SlicerKey) {
		slicerEnabled[key] = !slicerEnabled[key];
		if (slicerEnabled[key] && !slicerForms[key]) {
			const initialValue = formData.slicer_settings?.[key] || {};
			slicerForms[key] = initializeSlicerForm(key, initialValue);
		}
	}

	// Handle form submission
	function handleSubmit() {
		// Build slicer settings using shared helper
		const slicer_settings = buildSlicerSettings(slicerEnabled, slicerForms);

		// Build submit data with required fields
		const submitData: any = {
			name: formData.name,
			density: formData.density,
			diameter_tolerance: formData.diameter_tolerance
		};

		// Add optional fields using helper
		const optionalFields = buildOptionalFields(formData, [
			'min_print_temperature',
			'max_print_temperature',
			'min_bed_temperature',
			'max_bed_temperature',
			'preheat_temperature',
			'max_dry_temperature',
			'shore_hardness_a',
			'shore_hardness_d',
			'min_nozzle_diameter',
			'certifications',
			'data_sheet_url',
			'safety_sheet_url'
		]);
		Object.assign(submitData, optionalFields);

		// Always include discontinued (even when false)
		submitData.discontinued = formData.discontinued;

		if (Object.keys(slicer_settings).length > 0) {
			submitData.slicer_settings = slicer_settings;
		}

		onSubmit(submitData);
	}

	// Initialize slicer forms for enabled slicers on mount
	$effect(() => {
		for (const key of SLICER_KEYS) {
			if (slicerEnabled[key] && !slicerForms[key]) {
				const initialValue = formData.slicer_settings?.[key] || {};
				slicerForms[key] = initializeSlicerForm(key, initialValue);
			}
		}
	});
</script>

<TwoColumnLayout leftWidth="2/3" leftSpacing="sm">
	{#snippet leftContent()}
		<!-- Name -->
		<TextField bind:value={formData.name} id="filament-name" label="Name" required tooltip={TOOLTIPS.name} />

		<!-- Density and Diameter Tolerance -->
		<FormFieldRow>
			<NumberField
				bind:value={formData.density}
				id="density"
				label="Density (g/cm³)"
				required
				step={0.01}
				tooltip={TOOLTIPS.density}
			/>
			<NumberField
				bind:value={formData.diameter_tolerance}
				id="diameter-tolerance"
				label="Diameter Tolerance (mm)"
				required
				step={0.001}
				tooltip={TOOLTIPS.diameter_tolerance}
			/>
		</FormFieldRow>

		<!-- Print Temperature Range -->
		<FormFieldRow>
			<NumberField
				bind:value={formData.min_print_temperature}
				id="min-print-temp"
				label="Min Print Temp (°C)"
				placeholder="e.g., 190"
				tooltip={TOOLTIPS.min_print_temperature}
			/>
			<NumberField
				bind:value={formData.max_print_temperature}
				id="max-print-temp"
				label="Max Print Temp (°C)"
				placeholder="e.g., 220"
				tooltip={TOOLTIPS.max_print_temperature}
			/>
		</FormFieldRow>

		<!-- Bed Temperature Range -->
		<FormFieldRow>
			<NumberField
				bind:value={formData.min_bed_temperature}
				id="min-bed-temp"
				label="Min Bed Temp (°C)"
				placeholder="e.g., 50"
				tooltip={TOOLTIPS.min_bed_temperature}
			/>
			<NumberField
				bind:value={formData.max_bed_temperature}
				id="max-bed-temp"
				label="Max Bed Temp (°C)"
				placeholder="e.g., 70"
				tooltip={TOOLTIPS.max_bed_temperature}
			/>
		</FormFieldRow>

		<!-- Preheat and Max Dry Temperature -->
		<FormFieldRow>
			<NumberField
				bind:value={formData.preheat_temperature}
				id="preheat-temp"
				label="Preheat Temp (°C)"
				placeholder="e.g., 170"
				tooltip={TOOLTIPS.preheat_temperature}
			/>
			<NumberField
				bind:value={formData.max_dry_temperature}
				id="max-dry-temp"
				label="Max Dry Temp (°C)"
				placeholder="e.g., 55"
				tooltip={TOOLTIPS.max_dry_temperature}
			/>
		</FormFieldRow>

		<!-- Shore Hardness -->
		<FormFieldRow>
			<NumberField
				bind:value={formData.shore_hardness_a}
				id="shore-hardness-a"
				label="Shore Hardness A"
				placeholder="e.g., 95"
				tooltip={TOOLTIPS.shore_hardness_a}
			/>
			<NumberField
				bind:value={formData.shore_hardness_d}
				id="shore-hardness-d"
				label="Shore Hardness D"
				placeholder="e.g., 55"
				tooltip={TOOLTIPS.shore_hardness_d}
			/>
		</FormFieldRow>

		<!-- Min Nozzle Diameter -->
		<NumberField
			bind:value={formData.min_nozzle_diameter}
			id="min-nozzle-diameter"
			label="Min Nozzle Diameter (mm)"
			step={0.1}
			placeholder="e.g., 0.4"
			tooltip={TOOLTIPS.min_nozzle_diameter}
		/>

		<!-- Certifications -->
		<TagInput
			bind:tags={formData.certifications}
			label="Certifications"
			tooltip={TOOLTIPS.certifications}
			placeholder="Add certification..."
		/>

		<!-- Data Sheet URL and Safety Sheet URL -->
		<FormFieldRow>
			<TextField
				bind:value={formData.data_sheet_url}
				id="data-sheet-url"
				label="Data Sheet URL"
				type="url"
				placeholder="https://..."
				tooltip={TOOLTIPS.data_sheet_url}
			/>
			<TextField
				bind:value={formData.safety_sheet_url}
				id="safety-sheet-url"
				label="Safety Sheet URL"
				type="url"
				placeholder="https://..."
				tooltip={TOOLTIPS.safety_sheet_url}
			/>
		</FormFieldRow>

		<!-- Discontinued -->
		<CheckboxField bind:checked={formData.discontinued} id="discontinued" label="Discontinued" tooltip={TOOLTIPS.discontinued} />

		<!-- Slicer Toggles Section -->
		<FormSection title="Slicer Settings" tooltip={TOOLTIPS.slicer_settings}>
			<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} togglesOnly />
		</FormSection>

		<!-- Spacer to push submit button to bottom -->
		<div class="flex-1"></div>

		<!-- Submit Button -->
		<div class="pt-4">
			<button
				type="button"
				onclick={handleSubmit}
				disabled={saving || !formData.name || !formData.density || !formData.diameter_tolerance}
				class={BTN_SUBMIT}
			>
				{saving ? 'Saving...' : filament ? 'Update Filament' : 'Create Filament'}
			</button>
		</div>
	{/snippet}

	{#snippet rightContent()}
		<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} panelOnly />
	{/snippet}
</TwoColumnLayout>
