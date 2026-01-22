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

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="flex items-center gap-2" onclick={(e: MouseEvent) => e.stopPropagation()}>
	<input {id} type="checkbox" bind:checked class="checkbox-styled" />
	<label for={id} class="flex items-center text-sm font-medium text-foreground cursor-pointer">
		{label}
		{#if tooltip}<Tooltip text={tooltip} />{/if}
	</label>
</div>
