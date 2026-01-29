<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import { INPUT_CLASSES, LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';

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
		<label for={id} class={LABEL_CLASSES}>
			{label}
			{#if required}<span class={REQUIRED_INDICATOR}>*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<input {id} {type} bind:value class={INPUT_CLASSES} {required} {placeholder} />
</div>
