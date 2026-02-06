<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import { Checkbox } from '$lib/components/ui';

	interface Props {
		checked: boolean;
		id?: string;
		label: string;
		tooltip?: string;
	}

	let { checked = $bindable(false), id = 'checkbox-field', label, tooltip = '' }: Props = $props();

	function toggle() {
		checked = !checked;
	}
</script>

<div class="flex items-center gap-2">
	<Checkbox {id} bind:checked />
	<span
		onclick={toggle}
		onkeydown={(e) => e.key === 'Enter' && toggle()}
		role="button"
		tabindex="-1"
		class="flex items-center text-sm font-medium text-foreground cursor-pointer select-none"
	>
		{label}
		{#if tooltip}<Tooltip text={tooltip} />{/if}
	</span>
</div>
