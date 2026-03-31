<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SchemaForm, SlicerConfigPanel } from '$lib/components/forms';
	import { FormSection } from '$lib/components/form-fields';
	import {
		initializeSlicerForm,
		buildSlicerSettings,
		initializeSlicerEnabled,
		initializeSlicerForms,
		type SlicerKey
	} from '$lib/config/slicerConfig';
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { removeIdFromSchema } from '$lib/utils/schemaUtils';
	import { initializeFormData, buildSubmitData } from './schemaFormUtils';
	import type { SchemaFormConfig } from './schemaFormTypes';

	interface Props {
		filament?: any;
		schema?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
	}

	let { filament = null, schema: externalSchema, onSubmit, saving = false }: Props = $props();

	// Internal schema state (loaded if not provided externally)
	let internalSchema: any = $state(null);
	let schema = $derived(externalSchema || internalSchema);

	// Load schema on mount if not provided
	onMount(async () => {
		if (!externalSchema) {
			internalSchema = await fetchEntitySchema('filament');
		}
	});

	// Config for filament form - labels, tooltips, and placeholders come from schema
	const config: SchemaFormConfig = {
		splitAfterKey: 'discontinued',
		leftWidth: '2/3',
		leftSpacing: 'sm',
		hiddenFields: ['id', 'slicer_settings', 'slicer_ids'],
		fieldOrder: [
			'name',
			'density',
			'diameter_tolerance',
			'min_print_temperature',
			'max_print_temperature',
			'min_bed_temperature',
			'max_bed_temperature',
			'preheat_temperature',
			'max_dry_temperature',
			'min_chamber_temperature',
			'max_chamber_temperature',
			'chamber_temperature',
			'shore_hardness_a',
			'shore_hardness_d',
			'min_nozzle_diameter',
			'certifications',
			'data_sheet_url',
			'safety_sheet_url',
			'discontinued'
		],
		fieldGroups: [
			['density', 'diameter_tolerance'],
			['min_print_temperature', 'max_print_temperature'],
			['min_bed_temperature', 'max_bed_temperature'],
			['preheat_temperature', 'max_dry_temperature'],
			['min_chamber_temperature', 'max_chamber_temperature'],
			['shore_hardness_a', 'shore_hardness_d'],
			['data_sheet_url', 'safety_sheet_url']
		],
		typeOverrides: {
			certifications: 'stringList'
		},
		steps: {
			density: 0.01,
			diameter_tolerance: 0.001,
			min_nozzle_diameter: 0.1
		}
	};

	// Tooltip for slicer settings section (not from schema since it's a custom section)
	const SLICER_TOOLTIP = 'Configure slicer profiles and temperature overrides for different slicing software.';

	// Prepare schema - remove id field
	let preparedSchema = $derived(schema ? removeIdFromSchema(schema) : null);

	// Form data state - initialized when schema is available
	let formData = $state<Record<string, any>>({});

	// Slicer toggle state
	let slicerEnabled = $state<Record<SlicerKey, boolean>>(
		initializeSlicerEnabled(filament?.slicer_settings)
	);

	// Slicer settings forms
	let slicerForms = $state<Record<SlicerKey, any>>(initializeSlicerForms());

	// Track entity and schema changes to reinitialize form data
	// NOTE: must be plain variables, NOT $state — proxy identity breaks !== comparisons.
	let lastEntity: any = filament;
	let lastSchema: any = null;

	// Use $effect.pre to ensure formData is initialized before DOM renders
	$effect.pre(() => {
		// Reinitialize when schema becomes available or entity changes
		const prevEntity = untrack(() => lastEntity);
		const prevSchema = untrack(() => lastSchema);
		if (preparedSchema && (preparedSchema !== prevSchema || filament !== prevEntity)) {
			lastEntity = filament;
			lastSchema = preparedSchema;
			formData = initializeFormData(preparedSchema, filament, config.hiddenFields);
			slicerEnabled = initializeSlicerEnabled(filament?.slicer_settings);
			slicerForms = initializeSlicerForms();
		}
	});

	// Toggle slicer
	function toggleSlicer(key: SlicerKey) {
		slicerEnabled[key] = !slicerEnabled[key];
		if (slicerEnabled[key] && !slicerForms[key]) {
			const initialValue = filament?.slicer_settings?.[key] || {};
			slicerForms[key] = initializeSlicerForm(key, initialValue);
		}
	}

	// Handle form submission
	function handleSubmit(data: any) {
		// Build submit data using generic utility
		const submitData = buildSubmitData(preparedSchema, data, config.hiddenFields, undefined, config.transforms);

		// Handle slicer settings separately (complex nested object)
		const slicer_settings = buildSlicerSettings(slicerEnabled, slicerForms);
		if (Object.keys(slicer_settings).length > 0) {
			submitData.slicer_settings = slicer_settings;
		}

		onSubmit(submitData);
	}

	// Check if form can be submitted (name, density, diameter_tolerance are required)
	let canSubmit = $derived(
		!!formData.name && formData.density !== undefined && formData.diameter_tolerance !== undefined
	);
</script>

{#if !preparedSchema}
	<div class="flex items-center justify-center h-32">
		<p class="text-muted-foreground">Loading form...</p>
	</div>
{:else}
<SchemaForm
	schema={preparedSchema}
	bind:data={formData}
	{config}
	{saving}
	submitLabel={filament ? 'Update Filament' : 'Create Filament'}
	submitDisabled={!canSubmit}
	onSubmit={handleSubmit}
>
	{#snippet afterFields()}
		<FormSection
			title="Slicer Settings"
			tooltip={SLICER_TOOLTIP}
		>
			<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} togglesOnly />
		</FormSection>
	{/snippet}

	{#snippet rightColumnContent()}
		<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} panelOnly />
	{/snippet}
</SchemaForm>
{/if}
