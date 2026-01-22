<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		icon?: Snippet;
		message: string;
	}

	let { icon, message }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center h-full text-center p-4">
	{#if icon}
		{@render icon()}
	{/if}
	<p class="text-sm text-muted-foreground">{message}</p>
</div>
