<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import { INPUT_CLASSES, LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';

	interface Props {
		value: number | undefined;
		id?: string;
		label?: string;
		required?: boolean;
		placeholder?: string;
		tooltip?: string;
		step?: number | string;
		min?: number;
		max?: number;
	}

	let {
		value = $bindable(undefined),
		id = 'number-field',
		label = '',
		required = false,
		placeholder = '',
		tooltip = '',
		step = 'any',
		min = undefined,
		max = undefined
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
	<input {id} type="number" bind:value class={INPUT_CLASSES} {required} {placeholder} {step} {min} {max} />
</div>
