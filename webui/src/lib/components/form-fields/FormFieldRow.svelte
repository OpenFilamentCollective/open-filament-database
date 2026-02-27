<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		columns?: 2 | 3;
		gap?: 'sm' | 'md';
		children: Snippet;
	}

	let { columns = 2, gap = 'md', children }: Props = $props();

	const gapClasses: Record<string, string> = { sm: 'gap-2', md: 'gap-3' };
	const colClasses: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3' };
</script>

<div class="grid {colClasses[columns]} {gapClasses[gap]}">
	{@render children()}
</div>
