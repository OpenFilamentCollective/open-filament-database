<script lang="ts">
	import { untrack } from 'svelte';
	import { SchemaForm } from '$lib/components/forms';
	import { LogoUpload } from '$lib/components/form-fields';
	import { Tooltip } from '$lib/components/form-fields';
	import { INPUT_CLASSES, LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';
	import { removeIdFromSchema } from '$lib/utils/schemaUtils';
	import { initializeFormData, buildSubmitData } from './schemaFormUtils';
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
		typeOverrides: {
			origin: 'custom'
		}
	};

	// Prepare schema - remove id field
	let preparedSchema = $derived(removeIdFromSchema(schema));

	// Form data state
	let formData = $state<Record<string, any>>(
		initializeFormData(preparedSchema, brand, config.hiddenFields)
	);

	// Origin mode: separate state so switching to 'code' doesn't flip back when origin is empty
	let originMode = $state<'unknown' | 'code'>(
		(brand.origin && brand.origin !== 'Unknown') ? 'code' : 'unknown'
	);

	// Ensure origin defaults to 'Unknown' when in unknown mode (new brands get '' from schema default)
	if (originMode === 'unknown' && !formData.origin) {
		formData.origin = 'Unknown';
	}

	function handleOriginModeChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		originMode = select.value as 'unknown' | 'code';
		formData.origin = originMode === 'unknown' ? 'Unknown' : '';
	}

	function handleOriginInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const upper = input.value.toUpperCase();
		input.value = upper;
		formData.origin = upper;
	}

	// Logo validation error
	let logoError: string | null = $state(null);

	// Track entity changes to reinitialize form data
	// NOTE: must be a plain variable, NOT $state — $state proxies have different identity
	// than raw objects, so `!==` comparisons would always return true and cause infinite loops.
	let lastEntity: any = brand;
	$effect(() => {
		if (brand !== untrack(() => lastEntity)) {
			lastEntity = brand;
			formData = initializeFormData(preparedSchema, brand, config.hiddenFields);
			originMode = (brand.origin && brand.origin !== 'Unknown') ? 'code' : 'unknown';
			untrack(() => {
				if (originMode === 'unknown' && !formData.origin) {
					formData.origin = 'Unknown';
				}
			});
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
	{#snippet customFields(key, fieldSchema, field)}
		{#if key === 'origin'}
			<div class="flex flex-col">
				<label for="origin" class={LABEL_CLASSES}>
					{fieldSchema.title || 'Country of Origin'}
					<span class={REQUIRED_INDICATOR}>*</span>
					{#if fieldSchema.description}<Tooltip text={fieldSchema.description} />{/if}
				</label>
				<div class="flex">
					<select
						value={originMode}
						onchange={handleOriginModeChange}
						class="{INPUT_CLASSES} w-auto {originMode === 'code' ? 'rounded-r-none border-r-0' : ''}"
					>
						<option value="unknown">Unknown</option>
						<option value="code">Country Code</option>
					</select>
					{#if originMode === 'code'}
						<input
							id="origin"
							type="text"
							value={formData.origin}
							oninput={handleOriginInput}
							class="{INPUT_CLASSES} w-16 rounded-l-none uppercase"
							placeholder="US"
							maxlength="2"
							required
						/>
					{/if}
				</div>
			</div>
		{/if}
	{/snippet}
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
