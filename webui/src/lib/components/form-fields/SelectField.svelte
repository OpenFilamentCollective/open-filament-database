<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import type { Snippet } from 'svelte';
	import { INPUT_CLASSES, LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';

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
		<label for={id} class={LABEL_CLASSES}>
			{label}
			{#if required}<span class={REQUIRED_INDICATOR}>*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<select {id} bind:value class={INPUT_CLASSES} {required} {disabled}>
		{#if children}
			{@render children()}
		{:else}
			{#each options as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		{/if}
	</select>
</div>
