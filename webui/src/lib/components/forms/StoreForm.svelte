<script lang="ts">
	import { untrack } from 'svelte';
	import { SchemaForm } from '$lib/components/forms';
	import { LogoUpload } from '$lib/components/form-fields';
	import { removeIdFromSchema } from '$lib/utils/schemaUtils';
	import { initializeFormData, buildSubmitData } from './schemaFormUtils';
	import type { SchemaFormConfig } from './schemaFormTypes';

	interface Props {
		store: any;
		schema: any;
		onSubmit: (data: any) => void;
		onLogoChange: (dataUrl: string) => void;
		logoChanged?: boolean;
		saving?: boolean;
	}

	let { store, schema, onSubmit, onLogoChange, logoChanged = false, saving = false }: Props = $props();

	// Config for store form - labels, tooltips, and placeholders come from schema
	const config: SchemaFormConfig = {
		hiddenFields: ['id', 'logo'],
		fieldOrder: ['name', 'storefront_url', 'ships_from', 'ships_to'],
		fieldGroups: [['ships_from', 'ships_to']],
		typeOverrides: {
			ships_from: 'countryList',
			ships_to: 'countryList'
		}
	};

	// Prepare schema - remove id field
	let preparedSchema = $derived(removeIdFromSchema(schema));

	// Form data state
	let formData = $state<Record<string, any>>(
		initializeFormData(preparedSchema, store, config.hiddenFields)
	);

	// Logo validation error
	let logoError: string | null = $state(null);

	// Track entity changes to reinitialize form data
	// NOTE: must be a plain variable, NOT $state — proxy identity breaks !== comparisons.
	let lastEntity: any = store;
	$effect(() => {
		if (store !== untrack(() => lastEntity)) {
			lastEntity = store;
			formData = initializeFormData(preparedSchema, store, config.hiddenFields);
			logoError = null;
		}
	});

	// Clear logo error when logo is uploaded
	$effect(() => {
		if (logoChanged || store.logo) {
			logoError = null;
		}
	});

	// Handle form submission
	function handleSubmit(data: any) {
		// Check if logo exists before allowing submission
		if (!store.logo && !logoChanged) {
			logoError = 'A logo is required. Please upload a logo before submitting.';
			return;
		}

		logoError = null;
		const submitData = buildSubmitData(preparedSchema, data, config.hiddenFields, undefined, config.transforms);
		// Filter empty strings from country code arrays
		if (Array.isArray(submitData.ships_from)) {
			submitData.ships_from = submitData.ships_from.filter((v: string) => v.trim());
		}
		if (Array.isArray(submitData.ships_to)) {
			submitData.ships_to = submitData.ships_to.filter((v: string) => v.trim());
		}
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
	submitLabel={store?.id ? 'Update Store' : 'Create Store'}
	submitDisabled={!canSubmit}
	onSubmit={handleSubmit}
>
	{#snippet beforeFields()}
		<LogoUpload
			currentLogo={store.logo}
			entityType="store"
			entityId={store.id}
			{onLogoChange}
			label="Store Logo"
		/>
		{#if logoChanged}
			<p class="text-sm text-green-600 -mt-2 mb-4">Logo will be updated when you save</p>
		{/if}
		{#if logoError}
			<p class="text-sm text-destructive -mt-2 mb-4">{logoError}</p>
		{/if}
	{/snippet}
</SchemaForm>
