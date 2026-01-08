<script lang="ts">
	import { onMount } from 'svelte';
	import type { Brand } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import Logo from '$lib/components/Logo.svelte';

	let brands: Brand[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	onMount(async () => {
		try {
			const index = await db.loadIndex();
			brands = index.brands;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load brands';
		} finally {
			loading = false;
		}
	});
</script>

<div class="container mx-auto px-4 py-8">
	<div class="mb-6">
		<a href="/" class="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4">
			← Back to Home
		</a>
		<div class="flex items-center justify-between mb-2">
			<h1 class="text-3xl font-bold">Brands</h1>
			<a
				href="/brands/new"
				class="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add Brand
			</a>
		</div>
		<p class="text-gray-600">Browse and edit filament brands and their materials</p>
	</div>

	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-red-800">Error: {error}</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each brands as brand}
				<a
					href="/brands/{brand.slug ?? brand.id}"
					class="block p-6 border border-gray-200 rounded-lg hover:border-green-500 hover:shadow-lg transition-all"
				>
					<div class="flex items-center gap-4 mb-4">
						<Logo src={brand.logo} alt={brand.name} type="brand" id={brand.slug ?? brand.id} size="md" />
						<div>
							<h3 class="font-semibold text-lg">{brand.name}</h3>
							<p class="text-xs text-gray-500">ID: {brand.id}</p>
						</div>
					</div>
					<div class="space-y-1 text-sm">
						<p class="text-gray-600">Origin: {brand.origin}</p>
						<p class="text-blue-600 truncate">
							{brand.website}
						</p>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
