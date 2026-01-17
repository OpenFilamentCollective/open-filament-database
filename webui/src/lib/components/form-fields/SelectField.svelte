<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		value: string | number;
		id?: string;
		label?: string;
		required?: boolean;
		tooltip?: string;
		disabled?: boolean;
		options?: Array<{ value: string | number; label: string }>;
		children?: Snippet;
	}

	let {
		value = $bindable(''),
		id = 'select-field',
		label = '',
		required = false,
		tooltip = '',
		disabled = false,
		options = [],
		children
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
	<select
		{id}
		bind:value
		class="w-full px-3 py-2 bg-background text-foreground border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-colors"
		{required}
		{disabled}
	>
		{#if children}
			{@render children()}
		{:else}
			{#each options as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		{/if}
	</select>
</div>
