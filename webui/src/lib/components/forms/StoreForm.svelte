<script lang="ts">
	import GenericEntityForm from './GenericEntityForm.svelte';

	interface Props {
		store: any;
		schema: any;
		onSubmit: (data: any) => void;
		onLogoChange: (dataUrl: string) => void;
		logoChanged?: boolean;
		saving?: boolean;
	}

	let { store, schema, onSubmit, onLogoChange, logoChanged = false, saving = false }: Props = $props();
</script>

<GenericEntityForm
	entity={store}
	entityType="store"
	{schema}
	{onSubmit}
	{onLogoChange}
	{logoChanged}
	{saving}
/>
