<script lang="ts">
	import Tooltip from './Tooltip.svelte';

	interface Props {
		checked: boolean;
		id?: string;
		label: string;
		tooltip?: string;
	}

	let { checked = $bindable(false), id = 'checkbox-field', label, tooltip = '' }: Props = $props();
</script>

<div class="flex items-center gap-2">
	<input
		{id}
		type="checkbox"
		bind:checked
		class="w-4 h-4 rounded border-border bg-background text-primary focus:ring-ring"
	/>
	<label for={id} class="flex items-center text-sm font-medium text-foreground">
		{label}
		{#if tooltip}<Tooltip text={tooltip} />{/if}
	</label>
</div>
