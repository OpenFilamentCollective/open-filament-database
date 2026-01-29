<script lang="ts">
	import { untrack } from 'svelte';
	import { SchemaForm } from '$lib/components/forms';
	import { LogoUpload } from '$lib/components/form-fields';
	import { removeIdFromSchema } from '$lib/utils/schemaUtils';
	import { initializeFormData, buildSubmitData, transforms } from './schemaFormUtils';
	import type { SchemaFormConfig } from './schemaFormTypes';

	interface Props {
		brand: any;
		schema: any;
		onSubmit: (data: any) => void;
		onLogoChange: (dataUrl: string) => void;
		logoChanged?: boolean;
		saving?: boolean;
	}

	let { brand, schema, onSubmit, onLogoChange, logoChanged = false, saving = false }: Props = $props();

	// Config for brand form - labels, tooltips, and placeholders come from schema
	const config: SchemaFormConfig = {
		hiddenFields: ['id', 'logo'],
		fieldOrder: ['name', 'website', 'origin'],
		transforms: {
			origin: transforms.uppercase,
			website: transforms.urlWithProtocol
		}
	};

	// Prepare schema - remove id field
	let preparedSchema = $derived(removeIdFromSchema(schema));

	// Form data state
	let formData = $state<Record<string, any>>(
		initializeFormData(removeIdFromSchema(schema), brand, config.hiddenFields)
	);

	// Logo validation error
	let logoError: string | null = $state(null);

	// Track entity changes to reinitialize form data
	let lastEntity = $state<any>(brand);
	$effect(() => {
		if (brand !== untrack(() => lastEntity)) {
			lastEntity = brand;
			formData = initializeFormData(preparedSchema, brand, config.hiddenFields);
			logoError = null;
		}
	});

	// Clear logo error when logo is uploaded
	$effect(() => {
		if (logoChanged || brand.logo) {
			logoError = null;
		}
	});

	// Handle form submission
	function handleSubmit(data: any) {
		// Check if logo exists before allowing submission
		if (!brand.logo && !logoChanged) {
			logoError = 'A logo is required. Please upload a logo before submitting.';
			return;
		}

		logoError = null;
		const submitData = buildSubmitData(preparedSchema, data, config.hiddenFields, undefined, config.transforms);
		onSubmit(submitData);
	}

	// Check if form can be submitted (name is required)
	let canSubmit = $derived(!!formData.name);
</script>

<SchemaForm
	schema={preparedSchema}
	bind:data={formData}
	{config}
	{saving}
	submitLabel={brand?.id ? 'Update Brand' : 'Create Brand'}
	submitDisabled={!canSubmit}
	onSubmit={handleSubmit}
>
	{#snippet beforeFields()}
		<LogoUpload
			currentLogo={brand.logo}
			entityType="brand"
			entityId={brand.id}
			{onLogoChange}
			label="Brand Logo"
		/>
		{#if logoChanged}
			<p class="text-sm text-green-600 -mt-2 mb-4">Logo will be updated when you save</p>
		{/if}
		{#if logoError}
			<p class="text-sm text-destructive -mt-2 mb-4">{logoError}</p>
		{/if}
	{/snippet}
</SchemaForm>
