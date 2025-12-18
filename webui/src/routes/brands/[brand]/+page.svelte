<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import MaterialCard from '$lib/components/MaterialCard.svelte';
	import FolderGrid from '$lib/components/FolderGrid.svelte';

	let { data } = $props();

	const breadcrumbs = [{ label: data.brand.name }];
</script>

<svelte:head>
	<title>{data.brand.name} - Open Filament Database</title>
</svelte:head>

<div class="space-y-6">
	<Breadcrumb items={breadcrumbs} />

	<div class="flex items-start gap-6">
		{#if data.brand.logoPath}
			<img
				src="/api/images{data.brand.logoPath}"
				alt="{data.brand.name} logo"
				class="h-24 w-24 rounded-xl object-contain"
			/>
		{:else}
			<div
				class="flex h-24 w-24 items-center justify-center rounded-xl bg-gray-100 text-3xl font-bold text-gray-400 dark:bg-gray-700"
			>
				{data.brand.name.charAt(0)}
			</div>
		{/if}

		<div class="flex-1">
			<h1 class="text-3xl font-bold text-gray-900 dark:text-white">{data.brand.name}</h1>
			<div class="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
				<a
					href="https://{data.brand.data.website}"
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
					{data.brand.data.website}
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
					{data.brand.data.origin}
				</span>
			</div>
		</div>
	</div>

	<div>
		<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
			Materials ({data.brand.materials.length})
		</h2>
		<FolderGrid>
			{#each data.brand.materials as material}
				<MaterialCard {material} brandName={data.brand.name} />
			{/each}
		</FolderGrid>
	</div>
</div>
