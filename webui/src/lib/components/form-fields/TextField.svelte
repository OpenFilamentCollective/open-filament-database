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
		autoUppercase?: boolean;
		maxLength?: number;
	}

	let {
		value = $bindable(''),
		id = 'text-field',
		label = '',
		required = false,
		placeholder = '',
		tooltip = '',
		type = 'text',
		autoUppercase = false,
		maxLength = undefined as number | undefined
	}: Props = $props();

	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		let val = input.value;

		if (autoUppercase) {
			val = val.toUpperCase();
		}

		// Enforce maxLength client-side
		if (maxLength && val.length > maxLength) {
			val = val.slice(0, maxLength);
		}

		if (input.value !== val) {
			const pos = input.selectionStart;
			input.value = val;
			input.setSelectionRange(pos, pos);
		}
		value = val;
	}
</script>

<div class="flex flex-col">
	{#if label}
		<label for={id} class={LABEL_CLASSES}>
			{label}
			{#if required}<span class={REQUIRED_INDICATOR}>*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<input
		{id}
		{type}
		bind:value
		class="{INPUT_CLASSES}{autoUppercase ? ' uppercase' : ''}"
		{required}
		{placeholder}
		maxlength={maxLength}
		oninput={handleInput}
	/>
</div>
