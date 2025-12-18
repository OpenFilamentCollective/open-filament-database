<script lang="ts">
	import type { FilamentIndex } from '$lib/server/dataIndex';
	import { overlayFilament, getEffectiveUrl } from '$lib/dataOverlay';

	interface Props {
		filament: FilamentIndex;
		brandName: string;
		materialName: string;
		isLocalOnly?: boolean;
	}

	let { filament, brandName, materialName, isLocalOnly = false }: Props = $props();

	// Apply overlay to get effective data with local changes
	const overlay = $derived(overlayFilament(filament.data, brandName, materialName, filament.name));
	const effectiveData = $derived(overlay.data);
	const hasLocalChanges = $derived(overlay.hasLocalChanges);

	// Build effective URL (handles renames)
	const href = $derived(getEffectiveUrl('filament', brandName, materialName, filament.name));

	// Get up to 5 color swatches from variants
	const colorSwatches = $derived(filament.variants
		.slice(0, 5)
		.map((v) => {
			const hex = v.data.color_hex;
			return Array.isArray(hex) ? hex[0] : hex;
		})
		.filter(Boolean));
</script>

<a
	{href}
	class="group block rounded-lg border bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-800 {isLocalOnly ? 'border-green-400 dark:border-green-500' : hasLocalChanges ? 'border-amber-400 dark:border-amber-500' : 'border-gray-200 hover:border-blue-300 dark:border-gray-700'}"
>
	<div class="flex items-start justify-between">
		<h3 class="font-semibold text-gray-900 group-hover:text-blue-600 dark:text-white">
			{effectiveData.name}
		</h3>
		{#if isLocalOnly}
			<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200">
				New
			</span>
		{:else if hasLocalChanges}
			<span
				class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200"
			>
				Modified
			</span>
		{/if}
	</div>

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

	{#if effectiveData.discontinued}
		<span
			class="mt-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-200"
		>
			Discontinued
		</span>
	{/if}
</a>
