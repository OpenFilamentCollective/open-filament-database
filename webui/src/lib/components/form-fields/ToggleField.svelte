<script lang="ts">
	import { Switch } from '$lib/components/ui';
	import Tooltip from './Tooltip.svelte';

	interface Props {
		checked: boolean;
		label: string;
		tooltip?: string;
		onchange?: () => void;
	}

	let { checked = $bindable(false), label, tooltip = '', onchange }: Props = $props();

	function toggle() {
		checked = !checked;
		onchange?.();
	}
</script>

<div class="inline-flex items-center cursor-pointer gap-2">
	<Switch checked={checked} onchange={toggle} />
	<span
		onclick={toggle}
		onkeydown={(e) => e.key === 'Enter' && toggle()}
		role="button"
		tabindex="-1"
		class="text-sm font-medium text-foreground select-none"
	>
		{label}
	</span>
	{#if tooltip}<Tooltip text={tooltip} />{/if}
</div>
