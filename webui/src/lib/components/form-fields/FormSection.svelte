<script lang="ts">
	import type { Snippet } from 'svelte';
	import Tooltip from './Tooltip.svelte';
	import { SECTION_DIVIDER, SECTION_TITLE } from '$lib/styles/formStyles';

	interface Props {
		title: string;
		tooltip?: string;
		children: Snippet;
	}

	let { title, tooltip = '', children }: Props = $props();
</script>

<div class={SECTION_DIVIDER}>
	<h3 class={SECTION_TITLE}>
		{title}
		{#if tooltip}<Tooltip text={tooltip} />{/if}
	</h3>
	{@render children()}
</div>
