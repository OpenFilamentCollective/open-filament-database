<script lang="ts">
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import {
		normalizeSchema,
		normalizeDataForForm,
		createUiSchema,
		removeIdFromSchema,
		applyFormattedTitles
	} from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import NameField from '$lib/components/NameField.svelte';
	import LogoUpload from '$lib/components/LogoUpload.svelte';
	import '@sjsf/basic-theme/css/basic.css';
	import '$lib/styles/sjsf-buttons.css';

	interface Props {
		brand: any;
		schema: any;
		onSubmit: (data: any) => void;
		onLogoChange: (dataUrl: string) => void;
		logoChanged?: boolean;
		saving?: boolean;
	}

	let { brand, schema, onSubmit, onLogoChange, logoChanged = false, saving = false }: Props = $props();

	let formData: any = $state({ ...brand });
	let form: any = $state(null);
	let initialized = $state(false);
	let logoError: string | null = $state(null);

	// Initialize form when component mounts
	$effect(() => {
		if (schema && brand && !initialized) {
			// Normalize the schema to handle union types and remove ID field
			let normalizedSchema = normalizeSchema(schema);
			normalizedSchema = removeIdFromSchema(normalizedSchema);

			// Remove name and logo fields from schema (we'll handle them manually)
			if (normalizedSchema.properties) {
				const { name, logo, ...otherProps } = normalizedSchema.properties;
				normalizedSchema = {
					...normalizedSchema,
					properties: otherProps
				};
				// Also remove from required if present
				if (normalizedSchema.required) {
					normalizedSchema.required = normalizedSchema.required.filter(
						(field: string) => field !== 'name' && field !== 'logo'
					);
				}
			}

			// Remove additionalProperties: false to avoid validation errors
			// since we're only showing a subset of fields
			delete normalizedSchema.additionalProperties;

			normalizedSchema = applyFormattedTitles(normalizedSchema);

			// Normalize the data to match the schema
			const normalizedData = normalizeDataForForm({ ...brand }, normalizedSchema);

			// Prefill website with "https://" for new brands only
			if (!normalizedData.website || normalizedData.website === '') {
				normalizedData.website = 'https://';
			}

			formData = normalizedData;

			// Filter initialValue to only include properties in the schema
			// This prevents "additionalProperties" validation errors
			const schemaProps = Object.keys(normalizedSchema.properties || {});
			const filteredInitialValue: Record<string, any> = {};
			for (const key of schemaProps) {
				if (key in normalizedData) {
					filteredInitialValue[key] = normalizedData[key];
				}
			}

			form = createForm({
				...formDefaults,
				schema: normalizedSchema,
				uiSchema: createUiSchema(),
				translation: customTranslation,
				initialValue: filteredInitialValue,
				onSubmit: (data: any) => {
					// Check if logo exists before allowing submission
					if (!brand.logo && !logoChanged) {
						logoError = 'A logo is required. Please upload a logo before submitting.';
						return; // Prevent submission
					}

					logoError = null; // Clear error if logo exists
					// Merge the name field back in
					onSubmit({ ...data, name: formData.name });
				}
			});

			initialized = true;
		}
	});

	// Clear logo error when logo is uploaded
	$effect(() => {
		if (logoChanged || brand.logo) {
			logoError = null;
		}
	});
</script>

<div class="space-y-4">
	<!-- Name Field (Manual) -->
	<NameField bind:value={formData.name} id="brand-name-edit" />

	<!-- Logo Upload Section -->
	<div>
		<LogoUpload
			currentLogo={brand.logo}
			entityType="brand"
			entityId={brand.id}
			{onLogoChange}
			label="Brand Logo"
		/>
		{#if logoChanged}
			<p class="text-sm text-green-600 mt-2">Logo will be updated when you save</p>
		{/if}
		{#if logoError}
			<p class="text-sm text-red-600 mt-2">{logoError}</p>
		{/if}
	</div>

	{#if form}
		<BasicForm {form} />
	{/if}
</div>
