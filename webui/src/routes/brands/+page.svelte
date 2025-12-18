<script lang="ts">
	import { goto } from '$app/navigation';
	import BrandCard from '$lib/components/BrandCard.svelte';
	import FolderGrid from '$lib/components/FolderGrid.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import BrandForm from '$lib/components/forms/BrandForm.svelte';
	import { getChanges } from '$lib/stores/changes.svelte';
	import type { Brand } from '$lib/schemas/generated';

	let { data } = $props();

	const breadcrumbs = [{ label: 'Brands' }];

	let isCreating = $state(false);

	// Get locally created brands that don't exist on server yet
	let locallyCreatedBrands = $derived(
		getChanges()
			.filter((c) => {
				if (c.operation !== 'create' || !c.path.endsWith('/brand.json')) return false;
				// Check if this brand already exists on server
				const brandName = c.path.split('/')[0];
				return !data.brands.some((b) => b.name === brandName);
			})
			.map((c) => {
				const brandName = c.path.split('/')[0];
				return {
					name: brandName,
					path: brandName,
					data: c.data as Brand,
					logoPath: null,
					materials: [],
					isLocal: true
				};
			})
	);

	function handleCreateSave(newBrand: string) {
		isCreating = false;
		// Navigate to the new brand page
		goto(`/brands/${encodeURIComponent(newBrand)}`);
	}

	function handleCreateCancel() {
		isCreating = false;
	}
</script>

<svelte:head>
	<title>Brands - Open Filament Database</title>
</svelte:head>

<div class="space-y-6">
	<Breadcrumb items={breadcrumbs} />

	<div class="flex items-start justify-between">
		<div>
			<h1 class="text-3xl font-bold text-gray-900 dark:text-white">Brands</h1>
			<p class="mt-2 text-gray-600 dark:text-gray-400">
				{data.totalBrands} brand{data.totalBrands !== 1 ? 's' : ''} with {data.totalFilaments} filament{data.totalFilaments !== 1 ? 's' : ''} and {data.totalVariants} color variant{data.totalVariants !== 1 ? 's' : ''}
			</p>
		</div>
		<button
			onclick={() => (isCreating = true)}
			class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Brand
		</button>
	</div>

	{#if isCreating}
		<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Create New Brand</h2>
			<BrandForm
				brandPath=""
				onSave={handleCreateSave}
				onCancel={handleCreateCancel}
			/>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
		<div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
			<p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.totalBrands}</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">Brands</p>
		</div>
		<div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
			<p class="text-2xl font-bold text-green-600 dark:text-green-400">{data.totalMaterials}</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">Materials</p>
		</div>
		<div class="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
			<p class="text-2xl font-bold text-purple-600 dark:text-purple-400">{data.totalFilaments}</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">Filaments</p>
		</div>
		<div class="rounded-lg bg-orange-50 p-4 dark:bg-orange-900/20">
			<p class="text-2xl font-bold text-orange-600 dark:text-orange-400">{data.totalVariants}</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">Color Variants</p>
		</div>
	</div>

	<FolderGrid>
		{#each locallyCreatedBrands as brand}
			<BrandCard {brand} isLocalOnly={true} />
		{/each}
		{#each data.brands as brand}
			<BrandCard {brand} />
		{/each}
	</FolderGrid>
</div>
