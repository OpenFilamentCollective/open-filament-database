<script lang="ts">
	import Tooltip from './Tooltip.svelte';

	interface Props {
		value: string;
		id?: string;
		label?: string;
		required?: boolean;
		placeholder?: string;
		tooltip?: string;
		type?: 'text' | 'url' | 'email';
	}

	let {
		value = $bindable(''),
		id = 'text-field',
		label = '',
		required = false,
		placeholder = '',
		tooltip = '',
		type = 'text'
	}: Props = $props();
</script>

<div class="flex flex-col">
	{#if label}
		<label for={id} class="flex items-center text-sm font-medium text-foreground mb-1">
			{label}
			{#if required}<span class="text-destructive ml-1">*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<input
		{id}
		{type}
		bind:value
		class="w-full px-3 py-2 bg-background text-foreground border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-colors"
		{required}
		{placeholder}
	/>
</div>
