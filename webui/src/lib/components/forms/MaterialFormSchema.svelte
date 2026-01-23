<script lang="ts">
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

	interface Props {
		entity?: any;
		schema: any;
		config?: SchemaFormConfig;
		onSubmit: (data: any) => void;
		saving?: boolean;
	}

	let {
		entity = null,
		schema,
		config = {},
		onSubmit,
		saving = false
	}: Props = $props();

	// Default config for material form
	const defaultConfig: SchemaFormConfig = {
		splitAfterKey: 'default_max_dry_temperature',
		hiddenFields: ['default_slicer_settings']
	};
	let mergedConfig = $derived({ ...defaultConfig, ...config });

	// Prepare schema - remove id field
	let preparedSchema = $derived(removeIdFromSchema(schema));

	// Form data state - initialized synchronously from schema
	let formData = $state<Record<string, any>>(
		initializeFormData(removeIdFromSchema(schema), entity, defaultConfig.hiddenFields)
	);

	// Slicer toggle state - initialized synchronously
	let slicerEnabled = $state<Record<SlicerKey, boolean>>(
		initializeSlicerEnabled(entity?.default_slicer_settings)
	);

	// Slicer settings forms
	let slicerForms = $state<Record<SlicerKey, any>>(initializeSlicerForms());

	// Track entity changes to reinitialize form data and slicer state
	let lastEntity = $state<any>(entity);
	$effect(() => {
		// Reinitialize if entity reference changed
		if (entity !== lastEntity) {
			lastEntity = entity;
			formData = initializeFormData(preparedSchema, entity, mergedConfig.hiddenFields);
			slicerEnabled = initializeSlicerEnabled(entity?.default_slicer_settings);
			slicerForms = initializeSlicerForms();
		}
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
		const submitData = buildSubmitData(preparedSchema, data, mergedConfig.hiddenFields);

		// Handle slicer settings separately (complex nested object)
		const default_slicer_settings = buildSlicerSettings(slicerEnabled, slicerForms);
		if (Object.keys(default_slicer_settings).length > 0) {
			submitData.default_slicer_settings = default_slicer_settings;
		}

		onSubmit(submitData);
	}

	// Initialize slicer forms for enabled slicers
	$effect(() => {
		for (const key of SLICER_KEYS) {
			if (slicerEnabled[key] && !slicerForms[key]) {
				const initialValue = entity?.default_slicer_settings?.[key] || {};
				slicerForms[key] = initializeSlicerForm(key, initialValue);
			}
		}
	});

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
	submitLabel={entity ? 'Update Material' : 'Create Material'}
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
