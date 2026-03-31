<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import { Button } from '$lib/components/ui';
	import CloseIcon from '$lib/components/icons/CloseIcon.svelte';
	import { INPUT_CLASSES, LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';

	interface Props {
		values: string[];
		label?: string;
		required?: boolean;
		tooltip?: string;
		placeholder?: string;
		maxLength?: number;
		uppercase?: boolean;
	}

	let {
		values = $bindable([]),
		label = '',
		required = false,
		tooltip = '',
		placeholder = 'e.g., US',
		maxLength,
		uppercase = false
	}: Props = $props();

	function handleInput(index: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const val = uppercase ? input.value.toUpperCase() : input.value;
		input.value = val;
		values[index] = val;
		values = values;
	}

	function addField() {
		values = [...values, ''];
	}

	function removeField(index: number) {
		values = values.filter((_, i) => i !== index);
	}
</script>

<div class="flex flex-col">
	{#if label}
		<label class={LABEL_CLASSES}>
			{label}
			{#if required}<span class={REQUIRED_INDICATOR}>*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<div class="space-y-2">
		{#each values as value, index (index)}
			<div class="flex items-stretch">
				<input
					type="text"
					value={value}
					oninput={(e) => handleInput(index, e)}
					class="{INPUT_CLASSES} rounded-r-none border-r-0{uppercase ? ' uppercase' : ''}"
					{placeholder}
					maxlength={maxLength}
				/>
				<button
					type="button"
					onclick={() => removeField(index)}
					class="flex items-center px-2 border border-input border-l-0 rounded-r-md text-muted-foreground hover:text-destructive transition-colors"
					title="Remove"
				>
					<span class="border-l border-input h-5 mr-2"></span>
					<CloseIcon />
				</button>
			</div>
		{/each}
		<Button type="button" onclick={addField} variant="secondary" size="sm">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add
		</Button>
	</div>
</div>
