<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		leftWidth?: '1/2' | '2/3';
		leftSpacing?: 'sm' | 'md';
		leftContent: Snippet;
		rightContent: Snippet;
	}

	let { leftWidth = '1/2', leftSpacing = 'md', leftContent, rightContent }: Props = $props();

	const leftWidthClasses: Record<string, string> = { '1/2': 'w-1/2', '2/3': 'w-2/3' };
	const rightWidthClasses: Record<string, string> = { '1/2': 'w-1/2', '2/3': 'w-1/3' };
	const spacingClasses: Record<string, string> = { sm: 'space-y-3', md: 'space-y-4' };
</script>

<div class="flex gap-6 h-full">
	<div class="{leftWidthClasses[leftWidth]} {spacingClasses[leftSpacing]} flex flex-col overflow-y-auto px-1">
		{@render leftContent()}
	</div>
	<div class="{rightWidthClasses[leftWidth]} border-l pl-4 flex flex-col min-w-0">
		{@render rightContent()}
	</div>
</div>
