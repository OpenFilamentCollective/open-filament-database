<script lang="ts">
	import type { VariantIndex } from '$lib/server/dataIndex';

	interface Props {
		variant: VariantIndex;
		brandName: string;
		materialName: string;
		filamentName: string;
	}

	let { variant, brandName, materialName, filamentName }: Props = $props();

	// Handle single color or array of colors
	const colors = Array.isArray(variant.data.color_hex)
		? variant.data.color_hex
		: [variant.data.color_hex];

	const primaryColor = colors[0];
	const normalizedColor = primaryColor.startsWith('#') ? primaryColor : '#' + primaryColor;

	// Calculate if the color is light or dark for text contrast
	function isLightColor(hex: string): boolean {
		const cleanHex = hex.replace('#', '');
		const r = parseInt(cleanHex.slice(0, 2), 16);
		const g = parseInt(cleanHex.slice(2, 4), 16);
		const b = parseInt(cleanHex.slice(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5;
	}

	const isLight = isLightColor(normalizedColor);
</script>

<a
	href="/brands/{encodeURIComponent(brandName)}/{encodeURIComponent(materialName)}/{encodeURIComponent(filamentName)}/{encodeURIComponent(variant.name)}"
	class="group block overflow-hidden rounded-lg border border-gray-200 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700"
>
	<div class="relative h-24 w-full" style="background-color: {normalizedColor}">
		{#if colors.length > 1}
			<div class="absolute inset-0 flex">
				{#each colors as color, i}
					<div
						class="h-full flex-1"
						style="background-color: {color.startsWith('#') ? color : '#' + color}"
					></div>
				{/each}
			</div>
		{/if}

		{#if variant.data.traits?.translucent}
			<div class="absolute right-2 top-2">
				<span
					class="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-700 backdrop-blur-sm"
				>
					Translucent
				</span>
			</div>
		{/if}

		{#if variant.data.traits?.glow}
			<div class="absolute left-2 top-2">
				<span
					class="rounded-full bg-yellow-400/90 px-2 py-0.5 text-xs font-medium text-gray-900 backdrop-blur-sm"
				>
					Glow
				</span>
			</div>
		{/if}
	</div>

	<div class="bg-white p-3 dark:bg-gray-800">
		<h4 class="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white">
			{variant.data.color_name}
		</h4>
		<p class="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
			{normalizedColor.toUpperCase()}
		</p>

		{#if variant.data.discontinued}
			<span
				class="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-200"
			>
				Discontinued
			</span>
		{/if}

		{#if variant.sizes.length > 0}
			<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				{variant.sizes.length} size{variant.sizes.length !== 1 ? 's' : ''}
			</p>
		{/if}
	</div>
</a>
