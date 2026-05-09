<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SchemaForm, SlicerConfigPanel } from '$lib/components/forms';
	import { FormSection } from '$lib/components/form-fields';
	import {
		SLICER_KEYS,
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
	import { formDrafts } from '$lib/stores/formDrafts';

	interface Props {
		filament?: any;
		schema?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
		/** Optional key for in-memory draft preservation across modal close/reopen */
		draftKey?: string;
	}

	let { filament = null, schema: externalSchema, onSubmit, saving = false, draftKey }: Props = $props();

	type FilamentDraft = {
		formData: Record<string, any>;
		slicerEnabled: Record<SlicerKey, boolean>;
		slicerData: Record<string, any>;
	};

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

	// Restore from draft if one exists for this draftKey
	const initialDraft = draftKey ? formDrafts.get<FilamentDraft>(draftKey) : undefined;

	// Form data state - initialized when schema is available
	let formData = $state<Record<string, any>>(initialDraft?.formData ?? {});

	// Slicer toggle state
	let slicerEnabled = $state<Record<SlicerKey, boolean>>(
		initialDraft?.slicerEnabled ?? initializeSlicerEnabled(filament?.slicer_settings)
	);

	// Slicer settings forms
	let slicerForms = $state<Record<SlicerKey, any>>(initializeSlicerForms());
	{
		const initialSlicerSettings = initialDraft?.slicerData ?? filament?.slicer_settings;
		for (const key of SLICER_KEYS) {
			if (slicerEnabled[key]) {
				slicerForms[key] = initializeSlicerForm(key, initialSlicerSettings?.[key] ?? {});
			}
		}
	}

	// Track entity and schema changes to reinitialize form data
	// NOTE: must be plain variables, NOT $state — proxy identity breaks !== comparisons.
	let lastEntity: any = filament;
	let lastSchema: any = null;
	// If we restored from a draft, treat the current schema/entity as the baseline
	// so the first $effect.pre run doesn't clobber the restored draft.
	let draftRestored = !!initialDraft;

	// Use $effect.pre to ensure formData is initialized before DOM renders
	$effect.pre(() => {
		// Reinitialize when schema becomes available or entity changes
		const prevEntity = untrack(() => lastEntity);
		const prevSchema = untrack(() => lastSchema);
		if (preparedSchema && (preparedSchema !== prevSchema || filament !== prevEntity)) {
			lastEntity = filament;
			lastSchema = preparedSchema;
			if (draftRestored) {
				// Skip the schema/entity-change reinit on the first pass — the draft
				// is already populated. Subsequent prop changes will reinit normally.
				draftRestored = false;
				return;
			}
			formData = initializeFormData(preparedSchema, filament, config.hiddenFields);
			slicerEnabled = initializeSlicerEnabled(filament?.slicer_settings);
			slicerForms = initializeSlicerForms();
			// Pre-create forms for already-enabled slicers
			for (const key of SLICER_KEYS) {
				if (slicerEnabled[key]) {
					const initialValue = filament?.slicer_settings?.[key] || {};
					slicerForms[key] = initializeSlicerForm(key, initialValue);
				}
			}
		}
	});

	// Persist form state to the in-memory draft store on every change.
	$effect(() => {
		if (!draftKey) return;
		formDrafts.set(draftKey, {
			formData,
			slicerEnabled,
			slicerData: buildSlicerSettings(slicerEnabled, slicerForms)
		});
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
	submitLabel={filament?.id ? 'Update Filament' : 'Create Filament'}
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
