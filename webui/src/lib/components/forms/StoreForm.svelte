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
		store: any;
		schema: any;
		onSubmit: (data: any) => void;
		onLogoChange: (dataUrl: string) => void;
		logoChanged?: boolean;
		saving?: boolean;
	}

	let { store, schema, onSubmit, onLogoChange, logoChanged = false, saving = false }: Props = $props();

	let formData: any = $state({ ...store });
	let form: any = $state(null);
	let initialized = $state(false);

	// Initialize form when component mounts
	$effect(() => {
		if (schema && store && !initialized) {
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

			normalizedSchema = applyFormattedTitles(normalizedSchema);

			// Normalize the data to match the schema (convert strings to arrays where needed)
			const normalizedData = normalizeDataForForm({ ...store }, normalizedSchema);
			formData = normalizedData;

			form = createForm({
				...formDefaults,
				schema: normalizedSchema,
				uiSchema: createUiSchema(),
				translation: customTranslation,
				initialValue: normalizedData,
				onSubmit: (data: any) => {
					// Merge the name field back in
					onSubmit({ ...data, name: formData.name });
				}
			});

			initialized = true;
		}
	});
</script>

<div class="space-y-4">
	<!-- Name Field (Manual) -->
	<NameField bind:value={formData.name} id="store-name-edit" />

	<!-- Logo Upload Section -->
	<div>
		<LogoUpload
			currentLogo={store.logo}
			entityType="store"
			entityId={store.id}
			{onLogoChange}
			label="Store Logo"
		/>
		{#if logoChanged}
			<p class="text-sm text-green-600 mt-2">Logo will be updated when you save</p>
		{/if}
	</div>

	{#if form}
		<BasicForm {form} />
	{/if}
</div>
