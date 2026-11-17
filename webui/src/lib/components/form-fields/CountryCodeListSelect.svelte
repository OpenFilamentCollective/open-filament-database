<script lang="ts">
	import CountryCodeSelect from './CountryCodeSelect.svelte';
	import Tooltip from './Tooltip.svelte';
	import { Button } from '$lib/components/ui';
	import { LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';
	import { COUNTRY_SEARCH_PLACEHOLDER } from '$lib/config/messages';

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
		placeholder = COUNTRY_SEARCH_PLACEHOLDER
	}: Props = $props();

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
		{#each values as _value, index (index)}
			<div class="flex items-start gap-2">
				<div class="flex-1">
					<CountryCodeSelect
						bind:value={values[index]}
						{placeholder}
					/>
				</div>
				<button
					type="button"
					onclick={() => removeField(index)}
					class="mt-2 flex items-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
					title="Remove"
				>
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
