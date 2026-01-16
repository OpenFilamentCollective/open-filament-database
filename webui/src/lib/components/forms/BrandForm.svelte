<script lang="ts">
	import GenericEntityForm from './GenericEntityForm.svelte';

	interface Props {
		brand: any;
		schema: any;
		onSubmit: (data: any) => void;
		onLogoChange: (dataUrl: string) => void;
		logoChanged?: boolean;
		saving?: boolean;
	}

	let { brand, schema, onSubmit, onLogoChange, logoChanged = false, saving = false }: Props = $props();
</script>

<GenericEntityForm
	entity={brand}
	entityType="brand"
	{schema}
	{onSubmit}
	{onLogoChange}
	{logoChanged}
	{saving}
/>
