<script lang="ts">
	import { untrack } from 'svelte';
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
	import { removeIdFromSchema } from '$lib/utils/schemaUtils';
	import { initializeFormData, buildSubmitData } from './schemaFormUtils';
	import type { SchemaFormConfig } from './schemaFormTypes';
	import { formDrafts } from '$lib/stores/formDrafts';

	interface Props {
		entity?: any;
		schema: any;
		config?: SchemaFormConfig;
		onSubmit: (data: any) => void;
		saving?: boolean;
		/** Optional key for in-memory draft preservation across modal close/reopen */
		draftKey?: string;
	}

	let {
		entity = null,
		schema,
		config = {},
		onSubmit,
		saving = false,
		draftKey
	}: Props = $props();

	type MaterialDraft = {
		formData: Record<string, any>;
		slicerEnabled: Record<SlicerKey, boolean>;
		slicerData: Record<string, any>;
	};

	// Default config for material form
	const defaultConfig: SchemaFormConfig = {
		splitAfterKey: 'default_max_dry_temperature',
		hiddenFields: ['default_slicer_settings']
	};
	let mergedConfig = $derived({ ...defaultConfig, ...config });

	// Prepare schema - remove id field
	let preparedSchema = $derived(removeIdFromSchema(schema));

	// Restore from draft if one exists for this draftKey
	const initialDraft = draftKey ? formDrafts.get<MaterialDraft>(draftKey) : undefined;
	const initialSlicerSettings = initialDraft?.slicerData ?? entity?.default_slicer_settings;

	// Form data state - initialized synchronously from schema
	let formData = $state<Record<string, any>>(
		initialDraft?.formData ?? initializeFormData(removeIdFromSchema(schema), entity, defaultConfig.hiddenFields)
	);

	// Slicer toggle state - initialized synchronously
	let slicerEnabled = $state<Record<SlicerKey, boolean>>(
		initialDraft?.slicerEnabled ?? initializeSlicerEnabled(entity?.default_slicer_settings)
	);

	// Slicer settings forms — pre-create forms for already-enabled slicers
	let slicerForms = $state<Record<SlicerKey, any>>(initializeSlicerForms());
	for (const key of SLICER_KEYS) {
		if (slicerEnabled[key]) {
			slicerForms[key] = initializeSlicerForm(key, initialSlicerSettings?.[key] ?? {});
		}
	}

	// Track entity changes to reinitialize form data and slicer state
	// NOTE: must be a plain variable, NOT $state — proxy identity breaks !== comparisons.
	let lastEntity: any = entity;
	$effect(() => {
		// Reinitialize if entity reference changed
		if (entity !== untrack(() => lastEntity)) {
			lastEntity = entity;
			formData = initializeFormData(preparedSchema, entity, mergedConfig.hiddenFields);
			slicerEnabled = initializeSlicerEnabled(entity?.default_slicer_settings);
			slicerForms = initializeSlicerForms();
			// Pre-create forms for already-enabled slicers
			for (const key of SLICER_KEYS) {
				if (slicerEnabled[key]) {
					const initialValue = entity?.default_slicer_settings?.[key] || {};
					slicerForms[key] = initializeSlicerForm(key, initialValue);
				}
			}
		}
	});

	// Persist form state to the in-memory draft store on every change.
	// Slicer field-level edits aren't reactively tracked (sjsf-managed); they
	// get captured on toggle changes and form-data changes.
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
			const initialValue = entity?.default_slicer_settings?.[key] || {};
			slicerForms[key] = initializeSlicerForm(key, initialValue);
		}
	}

	// Handle form submission
	function handleSubmit(data: any) {
		// Build submit data using generic utility
		const submitData = buildSubmitData(preparedSchema, data, mergedConfig.hiddenFields, undefined, mergedConfig.transforms);

		// Handle slicer settings separately (complex nested object)
		const default_slicer_settings = buildSlicerSettings(slicerEnabled, slicerForms);
		if (Object.keys(default_slicer_settings).length > 0) {
			submitData.default_slicer_settings = default_slicer_settings;
		}

		onSubmit(submitData);
	}

	// Get the first required field for submit validation
	let firstRequiredField = $derived.by(() => {
		const required = preparedSchema?.required || [];
		return required[0] || null;
	});

	// Check if form can be submitted (first required field has value)
	let canSubmit = $derived(firstRequiredField ? !!formData[firstRequiredField] : true);
</script>

<SchemaForm
	schema={preparedSchema}
	bind:data={formData}
	config={mergedConfig}
	{saving}
	submitLabel={entity?.id ? 'Update Material' : 'Create Material'}
	submitDisabled={!canSubmit}
	onSubmit={handleSubmit}
>
	{#snippet afterFields()}
		<FormSection
			title="Default Slicer Settings"
			tooltip="Configure default slicer profiles and temperature overrides for different slicing software. Toggle each slicer to configure its specific settings."
		>
			<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} togglesOnly />
		</FormSection>
	{/snippet}

	{#snippet rightColumnContent()}
		<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} panelOnly />
	{/snippet}
</SchemaForm>
