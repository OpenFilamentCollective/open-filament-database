<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import { Button } from '$lib/components/ui';
	import { INPUT_CLASSES, LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';

	interface Props {
		values: string[];
		label?: string;
		required?: boolean;
		tooltip?: string;
		placeholder?: string;
	}

	let {
		values = $bindable([]),
		label = '',
		required = false,
		tooltip = '',
		placeholder = 'e.g., US'
	}: Props = $props();

	function handleInput(index: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const upper = input.value.toUpperCase();
		input.value = upper;
		values[index] = upper;
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
					class="{INPUT_CLASSES} rounded-r-none border-r-0 uppercase"
					{placeholder}
					maxlength="2"
				/>
				<button
					type="button"
					onclick={() => removeField(index)}
					class="flex items-center px-2 border border-input border-l-0 rounded-r-md text-muted-foreground hover:text-destructive transition-colors"
					title="Remove"
				>
					<span class="border-l border-input h-5 mr-2"></span>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clip-rule="evenodd"
						/>
					</svg>
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
