<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import { LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';

	interface Props {
		value: string;
		id?: string;
		label?: string;
		required?: boolean;
		tooltip?: string;
	}

	let { value = $bindable(''), id = 'color-hex', label = '', required = false, tooltip = '' }: Props = $props();

	// Normalize value to string (handles array values from schema with type ["string", "array"])
	let normalizedValue = $derived(
		typeof value === 'string' ? value : (Array.isArray(value) && value.length > 0 ? String(value[0]) : '')
	);

	// Strip # prefix for display, always store with #
	let hexValue = $derived(normalizedValue.startsWith('#') ? normalizedValue.slice(1) : normalizedValue);

	// Full color value for the color picker (needs #)
	let colorPickerValue = $derived(normalizedValue.startsWith('#') ? normalizedValue : `#${normalizedValue}`);

	function handleTextInput(e: Event) {
		const input = e.target as HTMLInputElement;
		// Remove any non-hex characters and limit to 6
		let cleaned = input.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
		value = `#${cleaned}`;
	}

	function handleColorPicker(e: Event) {
		const input = e.target as HTMLInputElement;
		value = input.value.toUpperCase();
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
	<div class="flex">
		<div class="flex flex-1 mr-2 items-center bg-background border border-border rounded-lg focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-colors">
			<span class="pl-3 pr-3 text-muted-foreground font-mono select-none">#</span>
			<input
				{id}
				type="text"
				value={hexValue}
				oninput={handleTextInput}
				class="flex-1 pr-3 py-2 bg-transparent border-0 border-l border-border text-foreground font-mono outline-none uppercase"
				placeholder="FF5733"
				maxlength="6"
				{required}
			/>
		</div>
		<input
			type="color"
			value={colorPickerValue}
			oninput={handleColorPicker}
			class="w-10 h-10 cursor-pointer shrink-0 bg-background [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-none"
		/>
	</div>
</div>
