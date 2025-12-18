<script lang="ts">
	import type { BrandIndex } from '$lib/server/dataIndex';

	interface Props {
		brand: BrandIndex;
	}

	let { brand }: Props = $props();
</script>

<a
	href="/brands/{encodeURIComponent(brand.name)}"
	class="group block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
>
	<div class="flex items-center gap-4">
		{#if brand.logoPath}
			<img
				src="/api/images{brand.logoPath}"
				alt="{brand.name} logo"
				class="h-12 w-12 rounded-lg object-contain"
			/>
		{:else}
			<div
				class="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-400 dark:bg-gray-700"
			>
				{brand.name.charAt(0)}
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<h3 class="truncate font-semibold text-gray-900 group-hover:text-blue-600 dark:text-white">
				{brand.name}
			</h3>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				{brand.materials.length} material{brand.materials.length !== 1 ? 's' : ''}
			</p>
		</div>
		<div
			class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
			title="Country of origin: {brand.data.origin}"
		>
			{brand.data.origin}
		</div>
	</div>
</a>
