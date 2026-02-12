<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui';

	interface Props {
		title: string;
		addLabel: string;
		onAdd: () => void;
		itemCount: number;
		emptyMessage: string;
		buttonVariant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline' | 'link';
		children: Snippet;
	}

	let {
		title,
		addLabel,
		onAdd,
		itemCount,
		emptyMessage,
		buttonVariant = 'secondary',
		children
	}: Props = $props();
</script>

<div class="bg-card border border-border rounded-lg p-6">
	<div class="flex justify-between items-center mb-4">
		<h2 class="text-xl font-semibold">{title}</h2>
		<Button onclick={onAdd} variant={buttonVariant} size="sm">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
			</svg>
			{addLabel}
		</Button>
	</div>

	{#if itemCount === 0}
		<p class="text-muted-foreground">{emptyMessage}</p>
	{:else}
		<div class="space-y-2">
			{@render children()}
		</div>
	{/if}
</div>
