<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import VariantForm from '$lib/components/forms/VariantForm.svelte';
	import SizesForm from '$lib/components/forms/SizesForm.svelte';
	import {
		overlayVariant,
		overlaySizes,
		checkForRenameRedirect,
		getEffectiveUrl,
		getEffectiveName
	} from '$lib/dataOverlay';
	import { getChangeByPath, getChangeByOriginalPath, addChange, removeChange } from '$lib/stores/changes.svelte';
	import type { Variant, FilamentSize, Brand, Material, Filament } from '$lib/schemas/generated';

	let { data } = $props();

	let isEditingVariant = $state(false);
	let isEditingSizes = $state(false);

	// Loading state for fetching renamed data
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let showNotFound = $state(false);
	let hasInitialized = $state(false);

	// Client-side overlaid data - initialize with defaults, will be populated on mount
	let effectiveVariantData = $state<Variant | null>(null);
	let effectiveSizes = $state<FilamentSize[]>([]);
	let hasVariantChanges = $state(false);
	let hasSizesChanges = $state(false);

	// Store loaded data from API or localStorage
	let resolvedBrand = $state<{ name: string; data: Brand } | null>(null);
	let resolvedMaterial = $state<{ name: string; data: Material } | null>(null);
	let resolvedFilament = $state<{ name: string; data: Filament } | null>(null);
	let resolvedVariant = $state<{ name: string; data: Variant; sizes: FilamentSize[] } | null>(null);

	// Original path for this variant (used for forms to save changes)
	let originalPath = $state<string>('');

	// Track if this is a locally-created item
	let isLocalOnly = $state(false);

	// Initialize data on mount (only runs once)
	onMount(() => {
		handleDataLoad();
	});

	async function handleDataLoad() {
		if (hasInitialized) return;
		hasInitialized = true;

		// If data was found on server, use it directly
		if (!data.notFound && data.brand && data.material && data.filament && data.variant) {
			resolvedBrand = data.brand;
			resolvedMaterial = data.material;
			resolvedFilament = data.filament;
			resolvedVariant = data.variant;
			originalPath = `${data.brand.name}/${data.material.name}/${data.filament.name}/${data.variant.name}`;

			// Check if the OLD path should redirect to NEW path
			const redirect = checkForRenameRedirect(
				'variant',
				data.brand.name,
				data.material.name,
				data.filament.name,
				data.variant.name
			);

			if (redirect) {
				goto(redirect, { replaceState: true });
				return;
			}

			applyOverlays();
			isLoading = false;
			return;
		}

		// Data not found on server - check localStorage for locally-created data
		const requestedPath = data.requestedPath;
		if (!requestedPath) {
			showNotFound = true;
			isLoading = false;
			return;
		}
		const { brandName, materialName, filamentName, variantName } = requestedPath;

		// Check if brand is locally created
		const brandPath = `${brandName}/brand.json`;
		const brandChange = getChangeByPath(brandPath);

		if (brandChange?.operation === 'create') {
			// Brand is locally created
			resolvedBrand = { name: brandName, data: brandChange.data as Brand };

			// Check if material is locally created
			const materialPath = `${brandName}/${materialName}/material.json`;
			const materialChange = getChangeByPath(materialPath);

			if (materialChange?.operation === 'create') {
				resolvedMaterial = { name: materialName, data: materialChange.data as Material };

				// Check if filament is locally created
				const filamentPath = `${brandName}/${materialName}/${filamentName}/filament.json`;
				const filamentChange = getChangeByPath(filamentPath);

				if (filamentChange?.operation === 'create') {
					resolvedFilament = { name: filamentName, data: filamentChange.data as Filament };

					// Check if variant is locally created
					const variantPath = `${brandName}/${materialName}/${filamentName}/${variantName}/variant.json`;
					const variantChange = getChangeByPath(variantPath);

					if (variantChange?.operation === 'create') {
						resolvedVariant = {
							name: variantName,
							data: variantChange.data as Variant,
							sizes: []
						};
						originalPath = `${brandName}/${materialName}/${filamentName}/${variantName}`;
						isLocalOnly = true;
						applyOverlays();
						isLoading = false;
						return;
					}
				}
			}
		} else if (data.notFoundType === 'material' && data.brand) {
			// Brand exists on server, material might be locally created
			resolvedBrand = data.brand;

			const materialPath = `${brandName}/${materialName}/material.json`;
			const materialChange = getChangeByPath(materialPath);

			if (materialChange?.operation === 'create') {
				resolvedMaterial = { name: materialName, data: materialChange.data as Material };

				const filamentPath = `${brandName}/${materialName}/${filamentName}/filament.json`;
				const filamentChange = getChangeByPath(filamentPath);

				if (filamentChange?.operation === 'create') {
					resolvedFilament = { name: filamentName, data: filamentChange.data as Filament };

					const variantPath = `${brandName}/${materialName}/${filamentName}/${variantName}/variant.json`;
					const variantChange = getChangeByPath(variantPath);

					if (variantChange?.operation === 'create') {
						resolvedVariant = {
							name: variantName,
							data: variantChange.data as Variant,
							sizes: []
						};
						originalPath = `${brandName}/${materialName}/${filamentName}/${variantName}`;
						isLocalOnly = true;
						applyOverlays();
						isLoading = false;
						return;
					}
				}
			}
		} else if (data.notFoundType === 'filament' && data.brand && data.material) {
			// Brand and material exist on server, filament might be locally created
			resolvedBrand = data.brand;
			resolvedMaterial = data.material;

			const filamentPath = `${brandName}/${materialName}/${filamentName}/filament.json`;
			const filamentChange = getChangeByPath(filamentPath);

			if (filamentChange?.operation === 'create') {
				resolvedFilament = { name: filamentName, data: filamentChange.data as Filament };

				const variantPath = `${brandName}/${materialName}/${filamentName}/${variantName}/variant.json`;
				const variantChange = getChangeByPath(variantPath);

				if (variantChange?.operation === 'create') {
					resolvedVariant = {
						name: variantName,
						data: variantChange.data as Variant,
						sizes: []
					};
					originalPath = `${brandName}/${materialName}/${filamentName}/${variantName}`;
					isLocalOnly = true;
					applyOverlays();
					isLoading = false;
					return;
				}
			}
		} else if (data.notFoundType === 'variant' && data.brand && data.material && data.filament) {
			// Brand, material, and filament exist on server, variant might be locally created
			resolvedBrand = data.brand;
			resolvedMaterial = data.material;
			resolvedFilament = data.filament;

			const variantPath = `${brandName}/${materialName}/${filamentName}/${variantName}/variant.json`;
			const variantChange = getChangeByPath(variantPath);

			if (variantChange?.operation === 'create') {
				resolvedVariant = {
					name: variantName,
					data: variantChange.data as Variant,
					sizes: []
				};
				originalPath = `${brandName}/${materialName}/${filamentName}/${variantName}`;
				isLocalOnly = true;
				applyOverlays();
				isLoading = false;
				return;
			}

			// Check if it's a renamed variant
			if (variantChange && variantChange.originalPath !== variantChange.path) {
				// This is a renamed item! Extract the original path
				const originalParts = variantChange.originalPath.split('/');
				const origVariant = originalParts[3];

				resolvedVariant = {
					name: origVariant,
					data: data.filament.variants.find((v) => v.name === origVariant)?.data as Variant,
					sizes: data.filament.variants.find((v) => v.name === origVariant)?.sizes || []
				};
				originalPath = `${brandName}/${materialName}/${filamentName}/${origVariant}`;
				applyOverlays();
				isLoading = false;
				return;
			}
		}

		// Not found anywhere
		showNotFound = true;
		isLoading = false;
	}

	function applyOverlays() {
		if (!resolvedBrand || !resolvedMaterial || !resolvedFilament || !resolvedVariant) return;

		// Apply variant overlay using the original path
		const variantOverlay = overlayVariant(
			resolvedVariant.data,
			resolvedBrand.name,
			resolvedMaterial.name,
			resolvedFilament.name,
			resolvedVariant.name
		);
		effectiveVariantData = variantOverlay.data;
		hasVariantChanges = variantOverlay.hasLocalChanges;

		// Apply sizes overlay
		const sizesOverlay = overlaySizes(
			resolvedVariant.sizes,
			resolvedBrand.name,
			resolvedMaterial.name,
			resolvedFilament.name,
			resolvedVariant.name
		);
		effectiveSizes = sizesOverlay.data;
		hasSizesChanges = sizesOverlay.hasLocalChanges;
	}

	// Compute display values from effective data
	let colors = $derived(
		effectiveVariantData
			? Array.isArray(effectiveVariantData.color_hex)
				? effectiveVariantData.color_hex
				: [effectiveVariantData.color_hex]
			: ['#888888']
	);

	let primaryColor = $derived(colors[0] || '#888888');
	let normalizedColor = $derived(primaryColor.startsWith('#') ? primaryColor : '#' + primaryColor);

	// Get effective names for breadcrumbs (considering renames)
	let effectiveBrandName = $derived(
		browser && resolvedBrand
			? getEffectiveName('brand', resolvedBrand.name, resolvedBrand.name)
			: resolvedBrand?.name ?? ''
	);
	let effectiveMaterialName = $derived(
		browser && resolvedBrand && resolvedMaterial
			? getEffectiveName('material', resolvedMaterial.name, resolvedBrand.name, resolvedMaterial.name)
			: resolvedMaterial?.data.material ?? ''
	);
	let effectiveFilamentName = $derived(
		browser && resolvedBrand && resolvedMaterial && resolvedFilament
			? getEffectiveName(
					'filament',
					resolvedFilament.name,
					resolvedBrand.name,
					resolvedMaterial.name,
					resolvedFilament.name
				)
			: resolvedFilament?.data.name ?? ''
	);

	let breadcrumbs = $derived(
		resolvedBrand && resolvedMaterial && resolvedFilament
			? [
					{ label: 'Brands', href: '/brands' },
					{
						label: effectiveBrandName,
						href: browser
							? getEffectiveUrl('brand', resolvedBrand.name)
							: `/brands/${encodeURIComponent(resolvedBrand.name)}`
					},
					{
						label: effectiveMaterialName,
						href: browser
							? getEffectiveUrl('material', resolvedBrand.name, resolvedMaterial.name)
							: `/brands/${encodeURIComponent(resolvedBrand.name)}/${encodeURIComponent(resolvedMaterial.name)}`
					},
					{
						label: effectiveFilamentName,
						href: browser
							? getEffectiveUrl('filament', resolvedBrand.name, resolvedMaterial.name, resolvedFilament.name)
							: `/brands/${encodeURIComponent(resolvedBrand.name)}/${encodeURIComponent(resolvedMaterial.name)}/${encodeURIComponent(resolvedFilament.name)}`
					},
					{ label: effectiveVariantData?.color_name ?? '' }
				]
			: [{ label: 'Brands', href: '/brands' }]
	);

	// Get store info for purchase links
	function getStore(storeId: string) {
		return data.stores.find((s) => s.id === storeId);
	}

	function handleVariantSave(newColorName: string) {
		isEditingVariant = false;

		// Re-apply overlays to get updated data
		applyOverlays();

		// Redirect if the URL should change (handles both rename and revert-to-original)
		if (resolvedBrand && resolvedMaterial && resolvedFilament) {
			const expectedUrl = `/brands/${encodeURIComponent(resolvedBrand.name)}/${encodeURIComponent(resolvedMaterial.name)}/${encodeURIComponent(resolvedFilament.name)}/${encodeURIComponent(newColorName)}`;
			if (expectedUrl !== window.location.pathname) {
				goto(expectedUrl, { replaceState: true });
			}
		}
	}

	function handleVariantCancel() {
		isEditingVariant = false;
	}

	function handleSizesSave() {
		isEditingSizes = false;
	}

	function handleSizesCancel() {
		isEditingSizes = false;
	}

	function handleDelete() {
		if (!effectiveVariantData || !resolvedBrand || !resolvedMaterial || !resolvedFilament) return;
		if (!confirm(`Are you sure you want to delete "${effectiveVariantData.color_name}"?`)) return;

		const path = `${originalPath}/variant.json`;
		const existingChange = getChangeByOriginalPath(path);

		if (existingChange?.operation === 'create') {
			// This was a locally created variant, just remove the create change
			removeChange(existingChange.id);
		} else {
			// Mark as deleted
			addChange('delete', path, effectiveVariantData as unknown as Record<string, unknown>);
		}

		// Navigate back to filament page
		goto(`/brands/${encodeURIComponent(resolvedBrand.name)}/${encodeURIComponent(resolvedMaterial.name)}/${encodeURIComponent(resolvedFilament.name)}`);
	}
</script>

<svelte:head>
	<title>
		{effectiveVariantData?.color_name ?? 'Not Found'} - {resolvedFilament?.data.name ?? 'Variant'} - Open Filament Database
	</title>
</svelte:head>

{#if isLoading}
	<div class="flex min-h-[400px] items-center justify-center">
		<div class="text-center">
			<div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
			<p class="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
		</div>
	</div>
{:else if showNotFound}
	{@const backUrl = data.notFound
		? data.notFoundType === 'brand'
			? '/brands'
			: data.notFoundType === 'material'
				? `/brands/${encodeURIComponent(data.requestedPath.brandName)}`
				: data.notFoundType === 'filament'
					? `/brands/${encodeURIComponent(data.requestedPath.brandName)}/${encodeURIComponent(data.requestedPath.materialName)}`
					: `/brands/${encodeURIComponent(data.requestedPath.brandName)}/${encodeURIComponent(data.requestedPath.materialName)}/${encodeURIComponent(data.requestedPath.filamentName)}`
		: '/brands'}
	<div class="flex min-h-[400px] items-center justify-center">
		<div class="text-center">
			<h1 class="text-4xl font-bold text-gray-900 dark:text-white">404</h1>
			<p class="mt-2 text-gray-600 dark:text-gray-400">
				{#if data.notFound}
					{data.notFoundType.charAt(0).toUpperCase() + data.notFoundType.slice(1)} "{data.notFoundName}" not found
				{:else}
					Page not found
				{/if}
			</p>
			{#if loadError}
				<p class="mt-2 text-sm text-red-500">{loadError}</p>
			{/if}
			<a
				href={backUrl}
				class="mt-4 inline-block rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
			>
				Go Back
			</a>
		</div>
	</div>
{:else if effectiveVariantData}
	<div class="space-y-6">
		<Breadcrumb items={breadcrumbs} />

		{#if isEditingVariant}
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
				<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Edit Variant</h2>
				{#key JSON.stringify(effectiveVariantData)}
					<VariantForm
						initialData={effectiveVariantData}
						variantPath={originalPath}
						onSave={handleVariantSave}
						onCancel={handleVariantCancel}
					/>
				{/key}
			</div>
		{:else}
			<div class="flex flex-col gap-6 lg:flex-row">
				<div
					class="relative h-48 w-full overflow-hidden rounded-xl lg:h-64 lg:w-64"
					style="background-color: {normalizedColor}"
				>
					{#if colors.length > 1}
						<div class="absolute inset-0 flex">
							{#each colors as color}
								<div
									class="h-full flex-1"
									style="background-color: {color.startsWith('#') ? color : '#' + color}"
								></div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="flex-1">
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-2">
							<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
								{effectiveVariantData.color_name}
							</h1>
							{#if isLocalOnly}
								<span
									class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200"
									title="Locally created - not yet submitted"
								>
									New
								</span>
							{:else if hasVariantChanges}
								<span
									class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200"
									title="Has unsaved local changes"
								>
									Modified
								</span>
							{/if}
						</div>
						<div class="flex gap-2">
							<button
								onclick={() => (isEditingVariant = true)}
								class="flex items-center gap-1 rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
									/>
								</svg>
								Edit
							</button>
							<button
								onclick={handleDelete}
								class="flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
								Delete
							</button>
						</div>
					</div>
					<p class="mt-1 text-gray-600 dark:text-gray-400">
						{effectiveBrandName} {effectiveFilamentName}
					</p>

					<div class="mt-4 flex flex-wrap gap-2">
						{#each colors as color}
							<span
								class="rounded-lg bg-gray-100 px-3 py-1 font-mono text-sm dark:bg-gray-700 dark:text-gray-200"
							>
								{color.startsWith('#') ? color.toUpperCase() : '#' + color.toUpperCase()}
							</span>
						{/each}
					</div>

					{#if effectiveVariantData.discontinued}
						<span
							class="mt-4 inline-block rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900 dark:text-red-200"
						>
							Discontinued
						</span>
					{/if}

					{#if effectiveVariantData.traits}
						<div class="mt-4 flex flex-wrap gap-2">
							{#if effectiveVariantData.traits.translucent}
								<span
									class="rounded-full bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200"
								>
									Translucent
								</span>
							{/if}
							{#if effectiveVariantData.traits.glow}
								<span
									class="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200"
								>
									Glow in Dark
								</span>
							{/if}
							{#if effectiveVariantData.traits.matte}
								<span
									class="rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-600 dark:text-gray-200"
								>
									Matte
								</span>
							{/if}
							{#if effectiveVariantData.traits.recycled}
								<span
									class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200"
								>
									Recycled
								</span>
							{/if}
							{#if effectiveVariantData.traits.recyclable}
								<span
									class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200"
								>
									Recyclable
								</span>
							{/if}
							{#if effectiveVariantData.traits.biodegradable}
								<span
									class="rounded-full bg-lime-100 px-2 py-1 text-xs font-medium text-lime-700 dark:bg-lime-900 dark:text-lime-200"
								>
									Biodegradable
								</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if effectiveVariantData.color_standards && !isEditingVariant}
			<div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
				<h3 class="font-semibold text-gray-900 dark:text-white">Color Standards</h3>
				<dl class="mt-2 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
					{#if effectiveVariantData.color_standards.ral}
						<div>
							<dt class="text-gray-500 dark:text-gray-400">RAL</dt>
							<dd class="font-medium text-gray-900 dark:text-white">
								{effectiveVariantData.color_standards.ral}
							</dd>
						</div>
					{/if}
					{#if effectiveVariantData.color_standards.pantone}
						<div>
							<dt class="text-gray-500 dark:text-gray-400">Pantone</dt>
							<dd class="font-medium text-gray-900 dark:text-white">
								{effectiveVariantData.color_standards.pantone}
							</dd>
						</div>
					{/if}
					{#if effectiveVariantData.color_standards.ncs}
						<div>
							<dt class="text-gray-500 dark:text-gray-400">NCS</dt>
							<dd class="font-medium text-gray-900 dark:text-white">
								{effectiveVariantData.color_standards.ncs}
							</dd>
						</div>
					{/if}
					{#if effectiveVariantData.color_standards.bs}
						<div>
							<dt class="text-gray-500 dark:text-gray-400">BS</dt>
							<dd class="font-medium text-gray-900 dark:text-white">
								{effectiveVariantData.color_standards.bs}
							</dd>
						</div>
					{/if}
					{#if effectiveVariantData.color_standards.munsell}
						<div>
							<dt class="text-gray-500 dark:text-gray-400">Munsell</dt>
							<dd class="font-medium text-gray-900 dark:text-white">
								{effectiveVariantData.color_standards.munsell}
							</dd>
						</div>
					{/if}
				</dl>
			</div>
		{/if}

		{#if isEditingSizes}
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
				<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Edit Sizes</h2>
				<SizesForm
					initialData={effectiveSizes}
					sizesPath={originalPath}
					onSave={handleSizesSave}
					onCancel={handleSizesCancel}
				/>
			</div>
		{:else}
			<div>
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
							Available Sizes ({effectiveSizes.length})
						</h2>
						{#if hasSizesChanges}
							<span
								class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200"
								title="Has unsaved local changes"
							>
								Modified
							</span>
						{/if}
					</div>
					<button
						onclick={() => (isEditingSizes = true)}
						class="flex items-center gap-1 rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
							/>
						</svg>
						Edit Sizes
					</button>
				</div>
				{#if effectiveSizes.length > 0}
					<div class="space-y-4">
						{#each effectiveSizes as size}
							<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
								<div class="flex flex-wrap items-center justify-between gap-4">
									<div>
										<h4 class="font-medium text-gray-900 dark:text-white">
											{size.filament_weight}g - {size.diameter}mm
										</h4>
										<div class="mt-1 flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
											{#if size.empty_spool_weight}
												<span>Spool: {size.empty_spool_weight}g</span>
											{/if}
											{#if size.ean}
												<span>EAN: {size.ean}</span>
											{/if}
											{#if size.article_number}
												<span>Article: {size.article_number}</span>
											{/if}
										</div>
									</div>

									{#if size.discontinued}
										<span
											class="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-200"
										>
											Discontinued
										</span>
									{/if}
								</div>

								{#if size.purchase_links && size.purchase_links.length > 0}
									<div class="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
										<h5 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
											Purchase Links
										</h5>
										<div class="flex flex-wrap gap-2">
											{#each size.purchase_links as link}
												{@const store = getStore(link.store_id)}
												<a
													href={link.url}
													target="_blank"
													rel="noopener noreferrer"
													class="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200"
												>
													{store?.data.name || link.store_id}
													{#if link.spool_refill}
														<span
															class="ml-1 rounded bg-green-200 px-1 py-0.5 text-xs text-green-800 dark:bg-green-800 dark:text-green-200"
														>
															Refill
														</span>
													{/if}
													{#if link.affiliate}
														<span
															class="ml-1 rounded bg-purple-200 px-1 py-0.5 text-xs text-purple-800 dark:bg-purple-800 dark:text-purple-200"
														>
															Affiliate
														</span>
													{/if}
												</a>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-gray-500 dark:text-gray-400">No sizes available yet.</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}
