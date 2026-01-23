<script lang="ts">
	import { apiBaseUrl } from '$lib/stores/environment';
	import { get } from 'svelte/store';
	import { SelectField, NumberField, FormSection, TwoColumnLayout } from '$lib/components/form-fields';
	import { SlicerConfigPanel } from '$lib/components/forms';
	import {
		SLICER_KEYS,
		initializeSlicerForm,
		buildSlicerSettings,
		initializeSlicerEnabled,
		initializeSlicerForms,
		type SlicerKey
	} from '$lib/config/slicerConfig';
	import { Button } from '$lib/components/ui';

	interface Props {
		material?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
	}

	let { material = null, onSubmit, saving = false }: Props = $props();

	// Material type enum values - fetched from API
	let materialTypes = $state<string[]>([]);
	let loadingMaterialTypes = $state(true);

	// Fetch material types from schema
	async function fetchMaterialTypes() {
		try {
			const baseUrl = get(apiBaseUrl);
			const response = await fetch(`${baseUrl}/api/v1/schemas/material_types_schema.json`);
			if (response.ok) {
				const schema = await response.json();
				if (schema.enum && Array.isArray(schema.enum)) {
					materialTypes = schema.enum;
				}
			}
		} catch (error) {
			console.error('Failed to fetch material types:', error);
		} finally {
			loadingMaterialTypes = false;
		}
	}

	// Fetch on mount
	$effect(() => {
		fetchMaterialTypes();
	});

	// Tooltip descriptions
	const TOOLTIPS = {
		material:
			'The type of material (e.g., PLA, PETG, ABS). This determines the base properties and recommended settings.',
		material_class:
			'The manufacturing process class. FFF (Fused Filament Fabrication) for standard filament printing, SLA for resin-based printing.',
		default_max_dry_temperature:
			'Maximum temperature (in °C) that can be used to dry this material without degradation. Common values: PLA ~45°C, PETG ~65°C, ABS ~80°C.',
		slicer_settings:
			'Configure default slicer profiles and temperature overrides for different slicing software. Toggle each slicer to configure its specific settings.'
	};

	// Form data state
	let formData = $state({
		material: material?.material || '',
		material_class: material?.material_class || '',
		default_max_dry_temperature: material?.default_max_dry_temperature || undefined,
		default_slicer_settings: material?.default_slicer_settings || {}
	});

	// Slicer toggle state
	let slicerEnabled = $state<Record<SlicerKey, boolean>>(
		initializeSlicerEnabled(material?.default_slicer_settings)
	);

	// Slicer settings forms
	let slicerForms = $state<Record<SlicerKey, any>>(initializeSlicerForms());

	// Toggle slicer
	function toggleSlicer(key: SlicerKey) {
		slicerEnabled[key] = !slicerEnabled[key];
		if (slicerEnabled[key] && !slicerForms[key]) {
			const initialValue = formData.default_slicer_settings?.[key] || {};
			slicerForms[key] = initializeSlicerForm(key, initialValue);
		}
	}

	// Handle form submission
	function handleSubmit() {
		// Build slicer settings using shared helper
		const default_slicer_settings = buildSlicerSettings(slicerEnabled, slicerForms);

		const submitData: any = {
			material: formData.material
		};

		// Only include material_class if it's set (not empty)
		if (formData.material_class) {
			submitData.material_class = formData.material_class;
		}

		if (formData.default_max_dry_temperature) {
			submitData.default_max_dry_temperature = formData.default_max_dry_temperature;
		}

		if (Object.keys(default_slicer_settings).length > 0) {
			submitData.default_slicer_settings = default_slicer_settings;
		}

		onSubmit(submitData);
	}

	// Initialize slicer forms for enabled slicers on mount
	$effect(() => {
		for (const key of SLICER_KEYS) {
			if (slicerEnabled[key] && !slicerForms[key]) {
				const initialValue = formData.default_slicer_settings?.[key] || {};
				slicerForms[key] = initializeSlicerForm(key, initialValue);
			}
		}
	});
</script>

<TwoColumnLayout>
	{#snippet leftContent()}
		<!-- Material Type Dropdown -->
		<SelectField
			bind:value={formData.material}
			id="material-type"
			label="Material Type"
			required
			tooltip={TOOLTIPS.material}
			disabled={loadingMaterialTypes}
		>
			{#if loadingMaterialTypes}
				<option value="">Loading material types...</option>
			{:else}
				<option value="">Select a material type...</option>
				{#each materialTypes as type}
					<option value={type}>{type}</option>
				{/each}
			{/if}
		</SelectField>

		<!-- Material Class -->
		<SelectField
			bind:value={formData.material_class}
			id="material-class"
			label="Material Class"
			tooltip={TOOLTIPS.material_class}
		>
			<option value="">Not set</option>
			<option value="FFF">FFF (Filament)</option>
			<option value="SLA">SLA (Resin)</option>
		</SelectField>

		<!-- Default Max Dry Temperature -->
		<NumberField
			bind:value={formData.default_max_dry_temperature}
			id="max-dry-temp"
			label="Default Max Dry Temperature (°C)"
			tooltip={TOOLTIPS.default_max_dry_temperature}
			placeholder="e.g., 55"
		/>

		<!-- Slicer Toggles Section -->
		<FormSection title="Default Slicer Settings" tooltip={TOOLTIPS.slicer_settings}>
			<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} togglesOnly />
		</FormSection>

		<!-- Spacer to push submit button to bottom -->
		<div class="flex-1"></div>

		<!-- Submit Button -->
		<div class="pt-4">
			<Button onclick={handleSubmit} disabled={saving || !formData.material} class="w-full">
				{saving ? 'Saving...' : material ? 'Update Material' : 'Create Material'}
			</Button>
		</div>
	{/snippet}

	{#snippet rightContent()}
		<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} panelOnly />
	{/snippet}
</TwoColumnLayout>
