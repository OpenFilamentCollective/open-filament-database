<script lang="ts">
	import { untrack } from 'svelte';
	import { SchemaForm } from '$lib/components/forms';
	import { LogoUpload, CountryCodeSelect } from '$lib/components/form-fields';
	import { Tooltip } from '$lib/components/form-fields';
	import { LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';
	import { removeIdFromSchema } from '$lib/utils/schemaUtils';
	import { initializeFormData, buildSubmitData } from './schemaFormUtils';
	import type { SchemaFormConfig } from './schemaFormTypes';
	import { LOGO_REQUIRED_ERROR, LOGO_UPDATE_SUCCESS } from '$lib/config/messages';
	import { formDrafts } from '$lib/stores/formDrafts';

	interface Props {
		brand: any;
		schema: any;
		onSubmit: (data: any) => void;
		onLogoChange: (dataUrl: string) => void;
		logoChanged?: boolean;
		saving?: boolean;
		/** Optional key for in-memory draft preservation across modal close/reopen */
		draftKey?: string;
	}

	let { brand, schema, onSubmit, onLogoChange, logoChanged = false, saving = false, draftKey }: Props = $props();

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

	// Form data state — restored from draft if one exists for this draftKey
	let formData = $state<Record<string, any>>(
		(draftKey && formDrafts.has(draftKey))
			? formDrafts.get(draftKey) as Record<string, any>
			: initializeFormData(preparedSchema, brand, config.hiddenFields)
	);

	// Origin mode: separate state so switching to 'code' doesn't flip back when origin is empty
	let originMode = $state<'unknown' | 'code'>(
		(formData.origin && formData.origin !== 'Unknown') ? 'code' : 'unknown'
	);

	// Ensure origin defaults to 'Unknown' when in unknown mode (new brands get '' from schema default)
	if (originMode === 'unknown' && !formData.origin) {
		formData.origin = 'Unknown';
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

	// Persist form data to the in-memory draft store on every change.
	$effect(() => {
		if (!draftKey) return;
		formDrafts.set(draftKey, formData);
	});

	// Handle form submission
	function handleSubmit(data: any) {
		// Check if logo exists before allowing submission
		if (!brand.logo && !logoChanged) {
			logoError = LOGO_REQUIRED_ERROR;
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
				<label class={LABEL_CLASSES}>
					{fieldSchema.title || 'Country of Origin'}
					<span class={REQUIRED_INDICATOR}>*</span>
					{#if fieldSchema.description}<Tooltip text={fieldSchema.description} />{/if}
				</label>
				<div class="flex items-start gap-2">
					<label class="flex items-center gap-1.5 text-sm">
						<input
							type="radio"
							name="origin-mode"
							value="unknown"
							checked={originMode === 'unknown'}
							onchange={() => { originMode = 'unknown'; formData.origin = 'Unknown'; }}
						/>
						Unknown
					</label>
					<label class="flex items-center gap-1.5 text-sm">
						<input
							type="radio"
							name="origin-mode"
							value="code"
							checked={originMode === 'code'}
							onchange={() => { originMode = 'code'; formData.origin = ''; }}
						/>
						Country Code
					</label>
				</div>
				{#if originMode === 'code'}
					<div class="mt-2">
						<CountryCodeSelect
							bind:value={formData.origin}
							placeholder="Search country..."
							required
						/>
					</div>
				{/if}
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
			<p class="text-sm text-green-600 -mt-2 mb-4">{LOGO_UPDATE_SUCCESS}</p>
		{/if}
		{#if logoError}
			<p class="text-sm text-destructive -mt-2 mb-4">{logoError}</p>
		{/if}
	{/snippet}
</SchemaForm>
