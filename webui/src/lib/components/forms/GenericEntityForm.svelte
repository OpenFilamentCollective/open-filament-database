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
	import { TextField, LogoUpload } from '$lib/components/form-fields';
	
	interface Props {
		entity: any;
		entityType: 'brand' | 'store';
		schema: any;
		onSubmit: (data: any) => void;
		onLogoChange: (dataUrl: string) => void;
		logoChanged?: boolean;
		saving?: boolean;
	}

	let { entity, entityType, schema, onSubmit, onLogoChange, logoChanged = false, saving = false }: Props = $props();

	let formData: any = $state({ ...entity });
	let form: any = $state(null);
	let initialized = $state(false);
	let logoError: string | null = $state(null);

	// Entity-specific configuration
	const config = $derived({
		urlField: entityType === 'brand' ? 'website' : 'storefront_url',
		logoLabel: entityType === 'brand' ? 'Brand Logo' : 'Store Logo',
		nameFieldId: `${entityType}-name-edit`
	});

	// Initialize form when component mounts
	$effect(() => {
		if (schema && entity && !initialized) {
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
			const normalizedData = normalizeDataForForm({ ...entity }, normalizedSchema);

			// Prefill URL field with "https://" for new entities only
			if (!normalizedData[config.urlField] || normalizedData[config.urlField] === '') {
				normalizedData[config.urlField] = 'https://';
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
					if (!entity.logo && !logoChanged) {
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
		if (logoChanged || entity.logo) {
			logoError = null;
		}
	});
</script>

<div class="space-y-4">
	<!-- Name Field (Manual) -->
	<TextField bind:value={formData.name} id={config.nameFieldId} label="Name" required />

	<!-- Logo Upload Section -->
	<div>
		<LogoUpload
			currentLogo={entity.logo}
			{entityType}
			entityId={entity.id}
			{onLogoChange}
			label={config.logoLabel}
		/>
		{#if logoChanged}
			<p class="text-sm text-green-600 mt-2">Logo will be updated when you save</p>
		{/if}
		{#if logoError}
			<p class="text-sm text-destructive mt-2">{logoError}</p>
		{/if}
	</div>

	{#if form}
		<BasicForm {form} />
	{/if}
</div>
