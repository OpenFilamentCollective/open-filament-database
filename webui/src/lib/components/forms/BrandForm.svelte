<script lang="ts">
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import { createUiSchema, removeIdFromSchema, applyFormattedTitles } from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
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

	// Initialize form when component mounts
	$effect(() => {
		if (schema && brand && !initialized) {
			const brandData = { ...brand };
			formData = brandData;

			// Remove ID and logo fields from schema for editing (we handle logo manually)
			let editSchema = removeIdFromSchema(schema);

			// Remove logo field from schema
			if (editSchema.properties && editSchema.properties.logo) {
				const { logo, ...otherProps } = editSchema.properties;
				editSchema = {
					...editSchema,
					properties: otherProps
				};
				// Also remove from required if present
				if (editSchema.required) {
					editSchema.required = editSchema.required.filter(
						(field: string) => field !== 'logo'
					);
				}
			}

			editSchema = applyFormattedTitles(editSchema);

			form = createForm({
				...formDefaults,
				schema: editSchema,
				uiSchema: createUiSchema(),
				translation: customTranslation,
				initialValue: brandData,
				onSubmit
			});

			initialized = true;
		}
	});
</script>

<div class="space-y-4">
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
	</div>

	{#if form}
		<BasicForm {form} />
	{/if}
</div>
