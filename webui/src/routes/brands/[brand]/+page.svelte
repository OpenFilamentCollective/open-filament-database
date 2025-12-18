<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import MaterialCard from '$lib/components/MaterialCard.svelte';
	import FolderGrid from '$lib/components/FolderGrid.svelte';
	import BrandForm from '$lib/components/forms/BrandForm.svelte';
	import MaterialForm from '$lib/components/forms/MaterialForm.svelte';
	import { overlayBrand, checkForRenameRedirect, getEffectiveUrl } from '$lib/dataOverlay';
	import { addChange, getChangeByOriginalPath, removeChange, getChanges } from '$lib/stores/changes.svelte';
	import type { Brand, Material } from '$lib/schemas/generated';

	let { data } = $props();

	let isEditing = $state(false);
	let isCreatingMaterial = $state(false);
	let isLocalOnly = $state(false);
	let notFound = $state(false);

	// Client-side overlaid data - initialize with server data or empty
	let effectiveBrandData = $state<Brand>(
		data.brand?.data ?? { brand: data.brandName, website: '', logo: '', origin: 'US' }
	);
	let hasBrandChanges = $state(false);

	// Original path for this brand (used for forms to save changes)
	let originalPath = $derived(data.brand?.name ?? data.brandName);

	// Apply overlay and check for redirects on mount
	onMount(() => {
		// Check if the OLD path should redirect to NEW path
		const redirect = checkForRenameRedirect('brand', data.brandName);

		if (redirect) {
			goto(redirect, { replaceState: true });
			return;
		}

		if (data.brand) {
			// Brand exists on server - apply overlay
			const brandOverlay = overlayBrand(data.brand.data, data.brand.name);
			effectiveBrandData = brandOverlay.data;
			hasBrandChanges = brandOverlay.hasLocalChanges;
		} else {
			// Brand not found on server - check for local pending change
			const localBrand = getChanges().find(
				(c) =>
					c.operation === 'create' &&
					c.path.endsWith('/brand.json') &&
					c.path.split('/')[0] === data.brandName
			);

			if (localBrand) {
				// Found local brand
				effectiveBrandData = localBrand.data as Brand;
				hasBrandChanges = true;
				isLocalOnly = true;
			} else {
				// Not found anywhere
				notFound = true;
			}
		}
	});

	let breadcrumbs = $derived([
		{ label: 'Brands', href: '/brands' },
		{ label: effectiveBrandData.brand }
	]);

	// Compute logo preview URL from effective data
	let logoPreviewUrl = $derived.by(() => {
		const logo = effectiveBrandData.logo;
		if (!logo) return null;
		if (logo.startsWith('data:')) return logo; // base64 data URL
		if (logo.startsWith('<svg') || logo.startsWith('<?xml')) {
			// Raw SVG - convert to data URL
			return `data:image/svg+xml;base64,${btoa(logo)}`;
		}
		// Filename - use server path if available
		if (data.brand?.logoPath) {
			return `/api/images${data.brand.logoPath}`;
		}
		return null;
	});

	function handleSave(newBrand: string) {
		isEditing = false;

		if (data.brand) {
			// Re-apply overlay to get updated data
			const brandOverlay = overlayBrand(data.brand.data, data.brand.name);
			effectiveBrandData = brandOverlay.data;
			hasBrandChanges = brandOverlay.hasLocalChanges;
		} else {
			// Local-only brand - get updated data from localStorage
			const localBrand = getChanges().find(
				(c) =>
					c.operation === 'create' &&
					c.path.endsWith('/brand.json') &&
					(c.path.split('/')[0] === data.brandName || c.path.split('/')[0] === newBrand)
			);
			if (localBrand) {
				effectiveBrandData = localBrand.data as Brand;
			}
		}

		// Redirect if the URL should change (handles both rename and revert-to-original)
		const expectedUrl = `/brands/${encodeURIComponent(newBrand)}`;
		if (expectedUrl !== window.location.pathname) {
			goto(expectedUrl, { replaceState: true });
		}
	}

	function handleCancel() {
		isEditing = false;
	}

	function handleDelete() {
		if (!confirm(`Are you sure you want to delete "${effectiveBrandData.brand}"? This will mark the brand and all its materials for deletion.`)) {
			return;
		}

		const path = `${originalPath}/brand.json`;
		const existingChange = getChangeByOriginalPath(path);

		// If this was a locally created brand, just remove the create change
		if (existingChange?.operation === 'create') {
			removeChange(existingChange.id);
		} else {
			// Mark for deletion
			addChange('delete', path, effectiveBrandData as unknown as Record<string, unknown>);
		}

		goto('/brands');
	}

	// Get locally created materials for this brand
	let locallyCreatedMaterials = $derived(
		getChanges()
			.filter((c) => {
				if (c.operation !== 'create' || !c.path.endsWith('/material.json')) return false;
				const parts = c.path.split('/');
				// Path format: {brandName}/{materialName}/material.json
				if (parts.length !== 3) return false;
				if (parts[0] !== originalPath) return false;
				// Check if this material already exists on server
				return !data.brand?.materials.some((m) => m.name === parts[1]);
			})
			.map((c) => {
				const materialName = c.path.split('/')[1];
				return {
					name: materialName,
					path: materialName,
					data: c.data as Material,
					filaments: [],
					isLocal: true
				};
			})
	);

	function handleMaterialCreateSave(newMaterial: string) {
		isCreatingMaterial = false;
		// Navigate to the new material page
		goto(`/brands/${encodeURIComponent(originalPath)}/${encodeURIComponent(newMaterial)}`);
	}

	function handleMaterialCreateCancel() {
		isCreatingMaterial = false;
	}
</script>

<svelte:head>
	<title>{notFound ? '404 - Not Found' : effectiveBrandData.brand} - Open Filament Database</title>
</svelte:head>

{#if notFound}
	<div class="flex flex-col items-center justify-center py-16 text-center">
		<h1 class="text-4xl font-bold text-gray-900 dark:text-white">404</h1>
		<p class="mt-2 text-lg text-gray-600 dark:text-gray-400">
			Brand "{data.brandName}" not found
		</p>
		<a
			href="/brands"
			class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
		>
			Back to Brands
		</a>
	</div>
{:else}
	<div class="space-y-6">
		<Breadcrumb items={breadcrumbs} />

		{#if isEditing}
		<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Edit Brand</h2>
			{#key JSON.stringify(effectiveBrandData)}
				<BrandForm
					initialData={effectiveBrandData}
					brandPath={originalPath}
					onSave={handleSave}
					onCancel={handleCancel}
				/>
			{/key}
		</div>
	{:else}
		<div class="flex items-start gap-6">
			{#if logoPreviewUrl}
				<img
					src={logoPreviewUrl}
					alt="{effectiveBrandData.brand} logo"
					class="h-24 w-24 rounded-xl object-contain"
				/>
			{:else}
				<div
					class="flex h-24 w-24 items-center justify-center rounded-xl bg-gray-100 text-3xl font-bold text-gray-400 dark:bg-gray-700"
				>
					{effectiveBrandData.brand.charAt(0)}
				</div>
			{/if}

			<div class="flex-1">
				<div class="flex items-start justify-between gap-2">
					<div class="flex items-center gap-2">
						<h1 class="text-3xl font-bold text-gray-900 dark:text-white">{effectiveBrandData.brand}</h1>
						{#if hasBrandChanges}
							<span
								class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200"
								title="Has unsaved local changes"
							>
								Modified
							</span>
						{/if}
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
				<div class="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
					<a
						href="https://{effectiveBrandData.website}"
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1 hover:text-blue-600"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
							/>
						</svg>
						{effectiveBrandData.website}
					</a>
					<span class="flex items-center gap-1">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
						{effectiveBrandData.origin}
					</span>
				</div>
			</div>
		</div>
	{/if}

		<div>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
					Materials ({(data.brand?.materials.length ?? 0) + locallyCreatedMaterials.length})
				</h2>
				<button
					onclick={() => (isCreatingMaterial = true)}
					class="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					New Material
				</button>
			</div>

			{#if isCreatingMaterial}
				<div class="mb-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
					<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Create New Material</h3>
					<MaterialForm
						materialPath={originalPath}
						onSave={handleMaterialCreateSave}
						onCancel={handleMaterialCreateCancel}
					/>
				</div>
			{/if}

			{#if (data.brand?.materials.length ?? 0) || locallyCreatedMaterials.length}
				<FolderGrid>
					{#each locallyCreatedMaterials as material}
						<MaterialCard {material} brandName={originalPath} isLocalOnly={true} />
					{/each}
					{#each data.brand?.materials ?? [] as material}
						<MaterialCard {material} brandName={data.brand?.name ?? originalPath} />
					{/each}
				</FolderGrid>
			{:else}
				<p class="text-sm text-gray-500 dark:text-gray-400">No materials yet.</p>
			{/if}
		</div>
	</div>
{/if}
