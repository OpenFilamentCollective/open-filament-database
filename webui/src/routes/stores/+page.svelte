<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import StoreCard from '$lib/components/StoreCard.svelte';
	import StoreForm from '$lib/components/forms/StoreForm.svelte';
	import { getChanges } from '$lib/stores/changes.svelte';
	import type { Store } from '$lib/schemas/generated';

	let { data } = $props();

	const breadcrumbs = [{ label: 'Stores' }];

	let isCreating = $state(false);

	// Get locally created stores that don't exist on server yet
	let locallyCreatedStores = $derived(
		getChanges()
			.filter((c) => {
				if (c.operation !== 'create' || !c.path.endsWith('/store.json')) return false;
				if (!c.path.startsWith('stores/')) return false;
				// Extract store ID from path: stores/{storeId}/store.json
				const storeId = c.path.split('/')[1];
				return !data.stores.some((s) => s.id === storeId);
			})
			.map((c) => {
				const storeId = c.path.split('/')[1];
				return {
					id: storeId,
					path: storeId,
					data: c.data as Store,
					isLocal: true
				};
			})
	);

	function handleCreateSave(newStoreId: string) {
		isCreating = false;
	}

	function handleCreateCancel() {
		isCreating = false;
	}
</script>

<svelte:head>
	<title>Stores - Open Filament Database</title>
</svelte:head>

<div class="space-y-6">
	<Breadcrumb items={breadcrumbs} />

	<div class="flex items-start justify-between">
		<div>
			<h1 class="text-3xl font-bold text-gray-900 dark:text-white">Stores</h1>
			<p class="mt-2 text-gray-600 dark:text-gray-400">
				{data.stores.length} store{data.stores.length !== 1 ? 's' : ''} in the database
			</p>
		</div>
		<button
			onclick={() => (isCreating = true)}
			class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Store
		</button>
	</div>

	{#if isCreating}
		<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Create New Store</h2>
			<StoreForm
				storeId=""
				onSave={handleCreateSave}
				onCancel={handleCreateCancel}
			/>
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each locallyCreatedStores as store}
			<StoreCard {store} isLocalOnly={true} />
		{/each}
		{#each data.stores as store}
			<StoreCard {store} />
		{/each}
	</div>
</div>