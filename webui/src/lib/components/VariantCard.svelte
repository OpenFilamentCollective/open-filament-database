<script lang="ts">
	import type { VariantIndex } from '$lib/server/dataIndex';
	import { overlayVariant, getEffectiveUrl } from '$lib/dataOverlay';

	interface Props {
		variant: VariantIndex;
		brandName: string;
		materialName: string;
		filamentName: string;
		isLocalOnly?: boolean;
	}

	let { variant, brandName, materialName, filamentName, isLocalOnly = false }: Props = $props();

	// Apply overlay to get effective data with local changes
	const overlay = $derived(overlayVariant(variant.data, brandName, materialName, filamentName, variant.name));
	const effectiveData = $derived(overlay.data);
	const hasLocalChanges = $derived(overlay.hasLocalChanges);

	// Build effective URL (handles renames)
	const href = $derived(getEffectiveUrl('variant', brandName, materialName, filamentName, variant.name));

	// Handle single color or array of colors (using effective data)
	const colors = $derived(Array.isArray(effectiveData.color_hex)
		? effectiveData.color_hex
		: [effectiveData.color_hex]);

	const primaryColor = $derived(colors[0]);
	const normalizedColor = $derived(primaryColor.startsWith('#') ? primaryColor : '#' + primaryColor);

	// Calculate if the color is light or dark for text contrast
	function isLightColor(hex: string): boolean {
		const cleanHex = hex.replace('#', '');
		const r = parseInt(cleanHex.slice(0, 2), 16);
		const g = parseInt(cleanHex.slice(2, 4), 16);
		const b = parseInt(cleanHex.slice(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5;
	}

	const isLight = $derived(isLightColor(normalizedColor));
</script>

<a
	{href}
	class="group block overflow-hidden rounded-lg border shadow-sm transition-all hover:shadow-md {isLocalOnly ? 'border-green-400 dark:border-green-500' : hasLocalChanges ? 'border-amber-400 dark:border-amber-500' : 'border-gray-200 hover:border-blue-300 dark:border-gray-700'}"
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

		{#if effectiveData.traits?.translucent}
			<div class="absolute right-2 top-2">
				<span
					class="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-700 backdrop-blur-sm"
				>
					Translucent
				</span>
			</div>
		{/if}

		{#if effectiveData.traits?.glow}
			<div class="absolute left-2 top-2">
				<span
					class="rounded-full bg-yellow-400/90 px-2 py-0.5 text-xs font-medium text-gray-900 backdrop-blur-sm"
				>
					Glow
				</span>
			</div>
		{/if}

		{#if isLocalOnly}
			<div class="absolute bottom-2 right-2">
				<span
					class="rounded-full bg-green-400/90 px-2 py-0.5 text-xs font-medium text-green-900 backdrop-blur-sm"
				>
					New
				</span>
			</div>
		{:else if hasLocalChanges}
			<div class="absolute bottom-2 right-2">
				<span
					class="rounded-full bg-amber-400/90 px-2 py-0.5 text-xs font-medium text-amber-900 backdrop-blur-sm"
				>
					Modified
				</span>
			</div>
		{/if}
	</div>

	<div class="bg-white p-3 dark:bg-gray-800">
		<h4 class="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white">
			{effectiveData.color_name}
		</h4>
		<p class="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
			{normalizedColor.toUpperCase()}
		</p>

		{#if effectiveData.discontinued}
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
