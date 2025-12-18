<script lang="ts">
	import BrandCard from '$lib/components/BrandCard.svelte';
	import FolderGrid from '$lib/components/FolderGrid.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Open Filament Database</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white">Open Filament Database</h1>
		<p class="mt-2 text-gray-600 dark:text-gray-400">
			A community-driven database of 3D printing filaments
		</p>
	</div>

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

	<div>
		<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Brands</h2>
		<FolderGrid>
			{#each data.brands as brand}
				<BrandCard {brand} />
			{/each}
		</FolderGrid>
	</div>
</div>
