<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import FilamentCard from '$lib/components/FilamentCard.svelte';
	import FolderGrid from '$lib/components/FolderGrid.svelte';
	import MaterialForm from '$lib/components/forms/MaterialForm.svelte';
	import FilamentForm from '$lib/components/forms/FilamentForm.svelte';
	import { overlayMaterial, checkForRenameRedirect, getEffectiveUrl, getEffectiveName } from '$lib/dataOverlay';
	import { addChange, getChangeByOriginalPath, getChangeByPath, removeChange, getChanges } from '$lib/stores/changes.svelte';
	import type { Material, Filament, Brand } from '$lib/schemas/generated';

	let { data } = $props();

	let isEditing = $state(false);
	let isCreatingFilament = $state(false);

	// Loading state for handling locally-created data
	let isLoading = $state(true);
	let showNotFound = $state(false);
	let hasInitialized = $state(false);

	// Resolved data (from server or localStorage)
	let resolvedBrand = $state<{ name: string; data: Brand } | null>(null);
	let resolvedMaterial = $state<{ name: string; data: Material; filaments: { name: string; path: string; data: Filament; variants: any[] }[] } | null>(null);

	// Client-side overlaid data
	let effectiveMaterialData = $state<Material | null>(null);
	let hasMaterialChanges = $state(false);
	let isLocalOnly = $state(false);

	// Original path for this material (used for forms to save changes)
	let originalPath = $state('');

	onMount(() => {
		handleDataLoad();
	});

	async function handleDataLoad() {
		if (hasInitialized) return;
		hasInitialized = true;

		// If data was found on server, use it directly
		if (!data.notFound && data.brand && data.material) {
			resolvedBrand = data.brand;
			resolvedMaterial = data.material;
			originalPath = `${data.brand.name}/${data.material.name}`;

			// Check if the OLD path should redirect to NEW path
			const redirect = checkForRenameRedirect('material', data.brand.name, data.material.name);
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
		const { brandName, materialName } = requestedPath;

		// Check if this is a locally-created brand
		const brandPath = `${brandName}/brand.json`;
		const brandChange = getChangeByPath(brandPath);

		if (brandChange?.operation === 'create') {
			// Brand is locally created
			resolvedBrand = { name: brandName, data: brandChange.data as Brand };

			// Check if material is also locally created
			const materialPath = `${brandName}/${materialName}/material.json`;
			const materialChange = getChangeByPath(materialPath);

			if (materialChange?.operation === 'create') {
				// Material is locally created
				resolvedMaterial = {
					name: materialName,
					data: materialChange.data as Material,
					filaments: []
				};
				originalPath = `${brandName}/${materialName}`;
				isLocalOnly = true;
				applyOverlays();
				isLoading = false;
				return;
			}
		} else if (data.notFoundType === 'material' && data.brand) {
			// Brand exists on server, but material might be locally created
			resolvedBrand = data.brand;

			const materialPath = `${brandName}/${materialName}/material.json`;
			const materialChange = getChangeByPath(materialPath);

			if (materialChange?.operation === 'create') {
				resolvedMaterial = {
					name: materialName,
					data: materialChange.data as Material,
					filaments: []
				};
				originalPath = `${brandName}/${materialName}`;
				isLocalOnly = true;
				applyOverlays();
				isLoading = false;
				return;
			}

			// Check for renamed material
			const renamedMaterialChange = getChangeByPath(materialPath);
			if (renamedMaterialChange && renamedMaterialChange.originalPath !== renamedMaterialChange.path) {
				// This is accessing a renamed material - need to fetch original data
				// For now, show not found
				showNotFound = true;
				isLoading = false;
				return;
			}
		}

		// Not found anywhere
		showNotFound = true;
		isLoading = false;
	}

	function applyOverlays() {
		if (!resolvedBrand || !resolvedMaterial) return;

		const materialOverlay = overlayMaterial(resolvedMaterial.data, resolvedBrand.name, resolvedMaterial.name);
		effectiveMaterialData = materialOverlay.data;
		hasMaterialChanges = materialOverlay.hasLocalChanges || isLocalOnly;
	}

	// Get effective names for breadcrumbs
	let effectiveBrandName = $derived(
		browser && resolvedBrand
			? getEffectiveName('brand', resolvedBrand.name, resolvedBrand.name)
			: resolvedBrand?.name ?? ''
	);

	let breadcrumbs = $derived(
		resolvedBrand && effectiveMaterialData
			? [
					{ label: 'Brands', href: '/brands' },
					{
						label: effectiveBrandName,
						href: browser
							? getEffectiveUrl('brand', resolvedBrand.name)
							: `/brands/${encodeURIComponent(resolvedBrand.name)}`
					},
					{ label: effectiveMaterialData.material }
				]
			: [{ label: 'Brands', href: '/brands' }]
	);

	function handleSave(newMaterial: string) {
		isEditing = false;
		applyOverlays();

		// Redirect if the URL should change
		if (resolvedBrand) {
			const expectedUrl = `/brands/${encodeURIComponent(resolvedBrand.name)}/${encodeURIComponent(newMaterial)}`;
			if (expectedUrl !== window.location.pathname) {
				goto(expectedUrl, { replaceState: true });
			}
		}
	}

	function handleCancel() {
		isEditing = false;
	}

	function handleDelete() {
		if (!effectiveMaterialData || !resolvedBrand) return;
		if (!confirm(`Are you sure you want to delete "${effectiveMaterialData.material}"? This will mark the material and all its filaments for deletion.`)) {
			return;
		}

		const path = `${originalPath}/material.json`;
		const existingChange = getChangeByOriginalPath(path);

		if (existingChange?.operation === 'create') {
			removeChange(existingChange.id);
		} else {
			addChange('delete', path, effectiveMaterialData as unknown as Record<string, unknown>);
		}

		goto(`/brands/${encodeURIComponent(resolvedBrand.name)}`);
	}

	// Get locally created filaments for this material
	let locallyCreatedFilaments = $derived(
		resolvedBrand && resolvedMaterial
			? getChanges()
					.filter((c) => {
						if (c.operation !== 'create' || !c.path.endsWith('/filament.json')) return false;
						const parts = c.path.split('/');
						if (parts.length !== 4) return false;
						if (parts[0] !== resolvedBrand!.name || parts[1] !== resolvedMaterial!.name) return false;
						return !resolvedMaterial!.filaments.some((f) => f.name === parts[2]);
					})
					.map((c) => {
						const filamentName = c.path.split('/')[2];
						return {
							name: filamentName,
							path: filamentName,
							data: c.data as Filament,
							variants: [],
							isLocal: true
						};
					})
			: []
	);

	function handleFilamentCreateSave(newFilament: string) {
		isCreatingFilament = false;
		if (resolvedBrand && resolvedMaterial) {
			goto(`/brands/${encodeURIComponent(resolvedBrand.name)}/${encodeURIComponent(resolvedMaterial.name)}/${encodeURIComponent(newFilament)}`);
		}
	}

	function handleFilamentCreateCancel() {
		isCreatingFilament = false;
	}
</script>

<svelte:head>
	<title>
		{effectiveMaterialData?.material ?? 'Not Found'} - {resolvedBrand?.name ?? 'Material'} - Open Filament Database
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
			: `/brands/${encodeURIComponent(data.requestedPath.brandName)}`
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
{:else if effectiveMaterialData && resolvedBrand && resolvedMaterial}
	<div class="space-y-6">
		<Breadcrumb items={breadcrumbs} />

		{#if isEditing}
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
				<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Edit Material</h2>
				{#key JSON.stringify(effectiveMaterialData)}
					<MaterialForm
						initialData={effectiveMaterialData}
						materialPath={originalPath}
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
							{effectiveMaterialData.material}
						</h1>
						{#if isLocalOnly}
							<span
								class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200"
								title="Locally created - not yet submitted"
							>
								New
							</span>
						{:else if hasMaterialChanges}
							<span
								class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200"
								title="Has unsaved local changes"
							>
								Modified
							</span>
						{/if}
					</div>
					<p class="mt-2 text-gray-600 dark:text-gray-400">
						{resolvedMaterial.filaments.length + locallyCreatedFilaments.length} filament{(resolvedMaterial.filaments.length + locallyCreatedFilaments.length) !== 1 ? 's' : ''}
					</p>
				</div>
				<div class="flex items-center gap-2">
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
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
						Delete
					</button>
				</div>
			</div>
		{/if}

		{#if resolvedMaterial.data.default_slicer_settings && !isEditing}
			<div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
				<h3 class="font-semibold text-gray-900 dark:text-white">Default Slicer Settings</h3>
				<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
					{#if resolvedMaterial.data.default_slicer_settings.generic}
						{@const generic = resolvedMaterial.data.default_slicer_settings.generic}
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
							{#if generic.nozzle_temp}
								<div>
									<span class="block font-medium">Nozzle</span>
									{generic.nozzle_temp}C
								</div>
							{/if}
							{#if generic.bed_temp}
								<div>
									<span class="block font-medium">Bed</span>
									{generic.bed_temp}C
								</div>
							{/if}
							{#if generic.first_layer_nozzle_temp}
								<div>
									<span class="block font-medium">First Layer Nozzle</span>
									{generic.first_layer_nozzle_temp}C
								</div>
							{/if}
							{#if generic.first_layer_bed_temp}
								<div>
									<span class="block font-medium">First Layer Bed</span>
									{generic.first_layer_bed_temp}C
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<div>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold text-gray-900 dark:text-white">Filaments</h2>
				<button
					onclick={() => (isCreatingFilament = true)}
					class="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					New Filament
				</button>
			</div>

			{#if isCreatingFilament}
				<div class="mb-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
					<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Create New Filament</h3>
					<FilamentForm
						filamentPath={originalPath}
						onSave={handleFilamentCreateSave}
						onCancel={handleFilamentCreateCancel}
					/>
				</div>
			{/if}

			{#if resolvedMaterial.filaments.length || locallyCreatedFilaments.length}
				<FolderGrid>
					{#each locallyCreatedFilaments as filament}
						<FilamentCard {filament} brandName={resolvedBrand.name} materialName={resolvedMaterial.name} isLocalOnly={true} />
					{/each}
					{#each resolvedMaterial.filaments as filament}
						<FilamentCard {filament} brandName={resolvedBrand.name} materialName={resolvedMaterial.name} />
					{/each}
				</FolderGrid>
			{:else}
				<p class="text-sm text-gray-500 dark:text-gray-400">No filaments yet.</p>
			{/if}
		</div>
	</div>
{/if}
