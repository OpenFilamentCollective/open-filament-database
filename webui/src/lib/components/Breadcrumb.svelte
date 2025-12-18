<script lang="ts">
	interface BreadcrumbItem {
		label: string;
		href?: string;
	}

	interface Props {
		items: BreadcrumbItem[];
	}

	let { items }: Props = $props();
</script>

<nav class="flex items-center space-x-2 text-sm">
	<a href="/" aria-label="Home" class="text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400">
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
			/>
		</svg>
	</a>

	{#each items as item, i}
		<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>

		{#if item.href && i < items.length - 1}
			<a
				href={item.href}
				class="truncate text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
			>
				{item.label}
			</a>
		{:else}
			<span class="truncate font-medium text-gray-900 dark:text-white">
				{item.label}
			</span>
		{/if}
	{/each}
</nav>
