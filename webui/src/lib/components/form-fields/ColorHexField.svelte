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
</script>

<div class="flex flex-col">
	{#if label}
		<label for={id} class={LABEL_CLASSES}>
			{label}
			{#if required}<span class={REQUIRED_INDICATOR}>*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<div class="flex gap-2">
		<input
			{id}
			type="text"
			bind:value
			class="flex-1 px-3 py-2 bg-background text-foreground border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring font-mono outline-none transition-colors"
			placeholder="#FF5733"
			{required}
		/>
		<input
			type="color"
			bind:value
			class="w-10 h-10 cursor-pointer shrink-0 rounded border border-border"
		/>
	</div>
</div>
