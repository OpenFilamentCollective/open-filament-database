<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import VariantCard from '$lib/components/VariantCard.svelte';
	import FolderGrid from '$lib/components/FolderGrid.svelte';
	import FilamentForm from '$lib/components/forms/FilamentForm.svelte';
	import VariantForm from '$lib/components/forms/VariantForm.svelte';
	import { overlayFilament, checkForRenameRedirect, getEffectiveUrl, getEffectiveName } from '$lib/dataOverlay';
	import { getChanges, getChangeByOriginalPath, getChangeByPath, addChange, removeChange } from '$lib/stores/changes.svelte';
	import type { Filament, Variant, Brand, Material } from '$lib/schemas/generated';

	let { data } = $props();

	let isEditing = $state(false);
	let isCreatingVariant = $state(false);

	// Loading state for handling locally-created data
	let isLoading = $state(true);
	let showNotFound = $state(false);
	let hasInitialized = $state(false);

	// Resolved data (from server or localStorage)
	let resolvedBrand = $state<{ name: string; data: Brand } | null>(null);
	let resolvedMaterial = $state<{ name: string; data: Material } | null>(null);
	let resolvedFilament = $state<{ name: string; data: Filament; variants: { name: string; path: string; data: Variant; sizes: any[] }[] } | null>(null);

	// Client-side overlaid data
	let effectiveFilamentData = $state<Filament | null>(null);
	let hasFilamentChanges = $state(false);
	let isLocalOnly = $state(false);

	// Original path for this filament (used for forms to save changes)
	let originalPath = $state('');

	onMount(() => {
		handleDataLoad();
	});

	async function handleDataLoad() {
		if (hasInitialized) return;
		hasInitialized = true;

		// If data was found on server, use it directly
		if (!data.notFound && data.brand && data.material && data.filament) {
			resolvedBrand = data.brand;
			resolvedMaterial = data.material;
			resolvedFilament = data.filament;
			originalPath = `${data.brand.name}/${data.material.name}/${data.filament.name}`;

			const redirect = checkForRenameRedirect('filament', data.brand.name, data.material.name, data.filament.name);
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
		const { brandName, materialName, filamentName } = requestedPath;

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
					resolvedFilament = {
						name: filamentName,
						data: filamentChange.data as Filament,
						variants: []
					};
					originalPath = `${brandName}/${materialName}/${filamentName}`;
					isLocalOnly = true;
					applyOverlays();
					isLoading = false;
					return;
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
					resolvedFilament = {
						name: filamentName,
						data: filamentChange.data as Filament,
						variants: []
					};
					originalPath = `${brandName}/${materialName}/${filamentName}`;
					isLocalOnly = true;
					applyOverlays();
					isLoading = false;
					return;
				}
			}
		} else if (data.notFoundType === 'filament' && data.brand && data.material) {
			// Brand and material exist on server, filament might be locally created
			resolvedBrand = data.brand;
			resolvedMaterial = data.material;

			const filamentPath = `${brandName}/${materialName}/${filamentName}/filament.json`;
			const filamentChange = getChangeByPath(filamentPath);

			if (filamentChange?.operation === 'create') {
				resolvedFilament = {
					name: filamentName,
					data: filamentChange.data as Filament,
					variants: []
				};
				originalPath = `${brandName}/${materialName}/${filamentName}`;
				isLocalOnly = true;
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
		if (!resolvedBrand || !resolvedMaterial || !resolvedFilament) return;

		const filamentOverlay = overlayFilament(resolvedFilament.data, resolvedBrand.name, resolvedMaterial.name, resolvedFilament.name);
		effectiveFilamentData = filamentOverlay.data;
		hasFilamentChanges = filamentOverlay.hasLocalChanges || isLocalOnly;
	}

	// Get effective names for breadcrumbs
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

	let breadcrumbs = $derived(
		resolvedBrand && resolvedMaterial && effectiveFilamentData
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
					{ label: effectiveFilamentData.name }
				]
			: [{ label: 'Brands', href: '/brands' }]
	);

	function handleSave(newName: string) {
		isEditing = false;
		applyOverlays();

		if (resolvedBrand && resolvedMaterial) {
			const expectedUrl = `/brands/${encodeURIComponent(resolvedBrand.name)}/${encodeURIComponent(resolvedMaterial.name)}/${encodeURIComponent(newName)}`;
			if (expectedUrl !== window.location.pathname) {
				goto(expectedUrl, { replaceState: true });
			}
		}
	}

	function handleCancel() {
		isEditing = false;
	}

	function handleDelete() {
		if (!effectiveFilamentData || !resolvedBrand || !resolvedMaterial) return;
		if (!confirm(`Are you sure you want to delete "${effectiveFilamentData.name}"?`)) return;

		const path = `${originalPath}/filament.json`;
		const existingChange = getChangeByOriginalPath(path);

		if (existingChange?.operation === 'create') {
			removeChange(existingChange.id);
		} else {
			addChange('delete', path, effectiveFilamentData as unknown as Record<string, unknown>);
		}

		goto(`/brands/${encodeURIComponent(resolvedBrand.name)}/${encodeURIComponent(resolvedMaterial.name)}`);
	}

	// Get locally created variants that don't exist on server yet
	let locallyCreatedVariants = $derived(
		resolvedBrand && resolvedMaterial && resolvedFilament
			? getChanges()
					.filter((c) => {
						if (c.operation !== 'create' || !c.path.endsWith('/variant.json')) return false;
						const parts = c.path.split('/');
						if (parts.length !== 5) return false;
						if (parts[0] !== resolvedBrand!.name || parts[1] !== resolvedMaterial!.name || parts[2] !== resolvedFilament!.name) return false;
						const variantName = parts[3];
						return !resolvedFilament!.variants.some((v) => v.name === variantName);
					})
					.map((c) => {
						const variantName = c.path.split('/')[3];
						return {
							name: variantName,
							path: variantName,
							data: c.data as Variant,
							sizes: [],
							isLocal: true
						};
					})
			: []
	);

	function handleVariantCreateSave(newVariantName: string) {
		isCreatingVariant = false;
		if (resolvedBrand && resolvedMaterial) {
			goto(`/brands/${encodeURIComponent(resolvedBrand.name)}/${encodeURIComponent(resolvedMaterial.name)}/${encodeURIComponent(newVariantName)}`);
		}
	}

	function handleVariantCreateCancel() {
		isCreatingVariant = false;
	}
</script>

<svelte:head>
	<title>
		{effectiveFilamentData?.name ?? 'Not Found'} - {resolvedBrand?.name ?? 'Filament'} - Open Filament Database
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
	{@const backUrl = data.notFound && data.requestedPath
		? data.notFoundType === 'brand'
			? '/brands'
			: data.notFoundType === 'material'
				? `/brands/${encodeURIComponent(data.requestedPath.brandName)}`
				: `/brands/${encodeURIComponent(data.requestedPath.brandName)}/${encodeURIComponent(data.requestedPath.materialName)}`
		: '/brands'}
	<div class="flex min-h-[400px] items-center justify-center">
		<div class="text-center">
			<h1 class="text-4xl font-bold text-gray-900 dark:text-white">404</h1>
			<p class="mt-2 text-gray-600 dark:text-gray-400">
				{#if data.notFound && data.notFoundType && data.notFoundName}
					{data.notFoundType.charAt(0).toUpperCase() + data.notFoundType.slice(1)} "{data.notFoundName}" not found
				{:else}
					Page not found
				{/if}
			</p>
			<a
				href={backUrl}
				class="mt-4 inline-block rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
			>
				Go Back
			</a>
		</div>
	</div>
{:else if effectiveFilamentData && resolvedBrand && resolvedMaterial && resolvedFilament}
	<div class="space-y-6">
		<Breadcrumb items={breadcrumbs} />

		{#if isEditing}
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
				<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Edit Filament</h2>
				{#key JSON.stringify(effectiveFilamentData)}
					<FilamentForm
						initialData={effectiveFilamentData}
						filamentPath={originalPath}
						onSave={handleSave}
						onCancel={handleCancel}
					/>
				{/key}
			</div>
		{:else}
			<div class="flex items-start justify-between">
				<div>
					<div class="flex items-center gap-2">
						<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
							{effectiveFilamentData.name}
						</h1>
						{#if isLocalOnly}
							<span
								class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200"
								title="Locally created - not yet submitted"
							>
								New
							</span>
						{:else if hasFilamentChanges}
							<span
								class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200"
								title="Has unsaved local changes"
							>
								Modified
							</span>
						{/if}
					</div>
					<p class="mt-1 text-gray-600 dark:text-gray-400">
						{resolvedBrand.name} - {resolvedMaterial.data.material}
					</p>

					{#if effectiveFilamentData.discontinued}
						<span
							class="mt-2 inline-block rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900 dark:text-red-200"
						>
							Discontinued
						</span>
					{/if}
				</div>
				<div class="flex gap-2">
					<button
						onclick={() => (isEditing = true)}
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

			<div class="grid gap-6 lg:grid-cols-2">
				<div class="space-y-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
					<h3 class="font-semibold text-gray-900 dark:text-white">Specifications</h3>
					<dl class="grid grid-cols-2 gap-4 text-sm">
						<div>
							<dt class="text-gray-500 dark:text-gray-400">Diameter Tolerance</dt>
							<dd class="font-medium text-gray-900 dark:text-white">
								{effectiveFilamentData.diameter_tolerance}mm
							</dd>
						</div>
						<div>
							<dt class="text-gray-500 dark:text-gray-400">Density</dt>
							<dd class="font-medium text-gray-900 dark:text-white">
								{effectiveFilamentData.density} g/cm3
							</dd>
						</div>
						{#if effectiveFilamentData.max_dry_temperature}
							<div>
								<dt class="text-gray-500 dark:text-gray-400">Max Dry Temperature</dt>
								<dd class="font-medium text-gray-900 dark:text-white">
									{effectiveFilamentData.max_dry_temperature}C
								</dd>
							</div>
						{/if}
					</dl>
				</div>

				<div class="space-y-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
					<h3 class="font-semibold text-gray-900 dark:text-white">Resources</h3>
					<div class="flex flex-wrap gap-2">
						{#if effectiveFilamentData.data_sheet_url}
							<a
								href={effectiveFilamentData.data_sheet_url}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
								Data Sheet
							</a>
						{/if}
						{#if effectiveFilamentData.safety_sheet_url}
							<a
								href={effectiveFilamentData.safety_sheet_url}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-1 rounded-lg bg-yellow-100 px-3 py-1.5 text-sm font-medium text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-200"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
								Safety Sheet
							</a>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<div>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
					Colors ({resolvedFilament.variants.length + locallyCreatedVariants.length})
				</h2>
				<button
					onclick={() => (isCreatingVariant = true)}
					class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					New Variant
				</button>
			</div>

			{#if isCreatingVariant}
				<div class="mb-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
					<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Create New Variant</h3>
					<VariantForm
						variantPath="{resolvedBrand.name}/{resolvedMaterial.name}/{resolvedFilament.name}"
						onSave={handleVariantCreateSave}
						onCancel={handleVariantCreateCancel}
					/>
				</div>
			{/if}

			<FolderGrid>
				{#each locallyCreatedVariants as variant}
					<VariantCard
						{variant}
						brandName={resolvedBrand.name}
						materialName={resolvedMaterial.name}
						filamentName={resolvedFilament.name}
						isLocalOnly={true}
					/>
				{/each}
				{#each resolvedFilament.variants as variant}
					<VariantCard
						{variant}
						brandName={resolvedBrand.name}
						materialName={resolvedMaterial.name}
						filamentName={resolvedFilament.name}
					/>
				{/each}
			</FolderGrid>
		</div>
	</div>
{/if}
