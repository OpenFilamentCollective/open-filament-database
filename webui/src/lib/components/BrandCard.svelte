<script lang="ts">
	import type { BrandIndex } from '$lib/server/dataIndex';
	import { overlayBrand, getEffectiveUrl } from '$lib/dataOverlay';

	interface Props {
		brand: BrandIndex;
		isLocalOnly?: boolean;
	}

	let { brand, isLocalOnly = false }: Props = $props();

	// Apply overlay to get effective data
	const overlay = overlayBrand(brand.data, brand.name);
	const effectiveData = overlay.data;
	const hasLocalChanges = overlay.hasLocalChanges;

	// Compute logo URL from effective data
	function getLogoUrl(): string | null {
		const logo = effectiveData.logo;
		if (!logo) return null;
		if (logo.startsWith('data:')) return logo;
		if (logo.startsWith('<svg') || logo.startsWith('<?xml')) {
			return `data:image/svg+xml;base64,${btoa(logo)}`;
		}
		// Filename - use server path if available
		if (brand.logoPath) {
			return `/api/images${brand.logoPath}`;
		}
		return null;
	}

	const logoUrl = getLogoUrl();
	const href = getEffectiveUrl('brand', brand.name);
</script>

<a
	{href}
	class="group block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
	class:border-green-300={isLocalOnly}
	class:dark:border-green-700={isLocalOnly}
	class:border-amber-300={hasLocalChanges && !isLocalOnly}
	class:dark:border-amber-700={hasLocalChanges && !isLocalOnly}
>
	<div class="flex items-center gap-4">
		{#if logoUrl}
			<img
				src={logoUrl}
				alt="{effectiveData.brand} logo"
				class="h-12 w-12 rounded-lg object-contain"
			/>
		{:else}
			<div
				class="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-400 dark:bg-gray-700"
			>
				{effectiveData.brand.charAt(0)}
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<h3 class="truncate font-semibold text-gray-900 group-hover:text-blue-600 dark:text-white">
					{effectiveData.brand}
				</h3>
				{#if isLocalOnly}
					<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200">
						New
					</span>
				{:else if hasLocalChanges}
					<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200">
						Modified
					</span>
				{/if}
			</div>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				{brand.materials.length} material{brand.materials.length !== 1 ? 's' : ''}
			</p>
		</div>
		<div
			class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
			title="Country of origin: {effectiveData.origin}"
		>
			{effectiveData.origin}
		</div>
	</div>
</a>
