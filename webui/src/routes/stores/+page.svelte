<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';

	let { data } = $props();

	const breadcrumbs = [{ label: 'Stores' }];

	function formatCountries(countries: string | string[]): string {
		if (Array.isArray(countries)) {
			return countries.join(', ');
		}
		return countries;
	}
</script>

<svelte:head>
	<title>Stores - Open Filament Database</title>
</svelte:head>

<div class="space-y-6">
	<Breadcrumb items={breadcrumbs} />

	<div>
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white">Stores</h1>
		<p class="mt-2 text-gray-600 dark:text-gray-400">
			{data.stores.length} store{data.stores.length !== 1 ? 's' : ''} in the database
		</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.stores as store}
			<div
				class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
			>
				<div class="flex items-center gap-3">
					<div
						class="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-400 dark:bg-gray-700"
					>
						{store.data.name.charAt(0)}
					</div>
					<div class="min-w-0 flex-1">
						<h3 class="truncate font-semibold text-gray-900 dark:text-white">
							{store.data.name}
						</h3>
						<a
							href={store.data.storefront_url}
							target="_blank"
							rel="noopener noreferrer"
							class="text-sm text-blue-600 hover:underline dark:text-blue-400"
						>
							Visit Store
						</a>
					</div>
				</div>

				<div class="mt-4 space-y-2 text-sm">
					<div class="flex items-center justify-between">
						<span class="text-gray-500 dark:text-gray-400">Ships from:</span>
						<span class="font-medium text-gray-900 dark:text-white">
							{formatCountries(store.data.ships_from)}
						</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-gray-500 dark:text-gray-400">Ships to:</span>
						<span class="font-medium text-gray-900 dark:text-white">
							{formatCountries(store.data.ships_to)}
						</span>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>
