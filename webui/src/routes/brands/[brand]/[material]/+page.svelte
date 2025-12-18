<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import FilamentCard from '$lib/components/FilamentCard.svelte';
	import FolderGrid from '$lib/components/FolderGrid.svelte';

	let { data } = $props();

	const breadcrumbs = [
		{ label: data.brand.name, href: `/brands/${encodeURIComponent(data.brand.name)}` },
		{ label: data.material.data.material }
	];
</script>

<svelte:head>
	<title>{data.material.data.material} - {data.brand.name} - Open Filament Database</title>
</svelte:head>

<div class="space-y-6">
	<Breadcrumb items={breadcrumbs} />

	<div>
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
			{data.brand.name} {data.material.data.material}
		</h1>
		<p class="mt-2 text-gray-600 dark:text-gray-400">
			{data.material.filaments.length} filament{data.material.filaments.length !== 1 ? 's' : ''}
		</p>
	</div>

	{#if data.material.data.default_slicer_settings}
		<div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
			<h3 class="font-semibold text-gray-900 dark:text-white">Default Slicer Settings</h3>
			<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
				{#if data.material.data.default_slicer_settings.generic}
					{@const generic = data.material.data.default_slicer_settings.generic}
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
		<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Filaments</h2>
		<FolderGrid>
			{#each data.material.filaments as filament}
				<FilamentCard {filament} brandName={data.brand.name} materialName={data.material.name} />
			{/each}
		</FolderGrid>
	</div>
</div>
