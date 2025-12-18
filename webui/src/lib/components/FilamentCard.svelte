<script lang="ts">
	import type { FilamentIndex } from '$lib/server/dataIndex';

	interface Props {
		filament: FilamentIndex;
		brandName: string;
		materialName: string;
	}

	let { filament, brandName, materialName }: Props = $props();

	// Get up to 5 color swatches from variants
	const colorSwatches = filament.variants
		.slice(0, 5)
		.map((v) => {
			const hex = v.data.color_hex;
			return Array.isArray(hex) ? hex[0] : hex;
		})
		.filter(Boolean);
</script>

<a
	href="/brands/{encodeURIComponent(brandName)}/{encodeURIComponent(materialName)}/{encodeURIComponent(filament.name)}"
	class="group block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
>
	<h3 class="font-semibold text-gray-900 group-hover:text-blue-600 dark:text-white">
		{filament.data.name}
	</h3>

	<div class="mt-2 flex items-center gap-2">
		<div class="flex -space-x-1">
			{#each colorSwatches as color}
				<div
					class="h-5 w-5 rounded-full border-2 border-white shadow-sm dark:border-gray-800"
					style="background-color: {color.startsWith('#') ? color : '#' + color}"
				></div>
			{/each}
			{#if filament.variants.length > 5}
				<div
					class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-xs font-medium text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-600 dark:text-gray-300"
				>
					+{filament.variants.length - 5}
				</div>
			{/if}
		</div>
		<span class="text-sm text-gray-500 dark:text-gray-400">
			{filament.variants.length} color{filament.variants.length !== 1 ? 's' : ''}
		</span>
	</div>

	{#if filament.data.discontinued}
		<span
			class="mt-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-200"
		>
			Discontinued
		</span>
	{/if}
</a>
