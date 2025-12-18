<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import VariantCard from '$lib/components/VariantCard.svelte';
	import FolderGrid from '$lib/components/FolderGrid.svelte';

	let { data } = $props();

	const breadcrumbs = [
		{ label: data.brand.name, href: `/brands/${encodeURIComponent(data.brand.name)}` },
		{
			label: data.material.data.material,
			href: `/brands/${encodeURIComponent(data.brand.name)}/${encodeURIComponent(data.material.name)}`
		},
		{ label: data.filament.data.name }
	];
</script>

<svelte:head>
	<title>{data.filament.data.name} - {data.brand.name} - Open Filament Database</title>
</svelte:head>

<div class="space-y-6">
	<Breadcrumb items={breadcrumbs} />

	<div>
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
			{data.filament.data.name}
		</h1>
		<p class="mt-1 text-gray-600 dark:text-gray-400">
			{data.brand.name} - {data.material.data.material}
		</p>

		{#if data.filament.data.discontinued}
			<span
				class="mt-2 inline-block rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900 dark:text-red-200"
			>
				Discontinued
			</span>
		{/if}
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="space-y-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
			<h3 class="font-semibold text-gray-900 dark:text-white">Specifications</h3>
			<dl class="grid grid-cols-2 gap-4 text-sm">
				<div>
					<dt class="text-gray-500 dark:text-gray-400">Diameter Tolerance</dt>
					<dd class="font-medium text-gray-900 dark:text-white">
						{data.filament.data.diameter_tolerance}mm
					</dd>
				</div>
				<div>
					<dt class="text-gray-500 dark:text-gray-400">Density</dt>
					<dd class="font-medium text-gray-900 dark:text-white">
						{data.filament.data.density} g/cm3
					</dd>
				</div>
				{#if data.filament.data.max_dry_temperature}
					<div>
						<dt class="text-gray-500 dark:text-gray-400">Max Dry Temperature</dt>
						<dd class="font-medium text-gray-900 dark:text-white">
							{data.filament.data.max_dry_temperature}C
						</dd>
					</div>
				{/if}
			</dl>
		</div>

		<div class="space-y-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
			<h3 class="font-semibold text-gray-900 dark:text-white">Resources</h3>
			<div class="flex flex-wrap gap-2">
				{#if data.filament.data.data_sheet_url}
					<a
						href={data.filament.data.data_sheet_url}
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
				{#if data.filament.data.safety_sheet_url}
					<a
						href={data.filament.data.safety_sheet_url}
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

	<div>
		<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
			Colors ({data.filament.variants.length})
		</h2>
		<FolderGrid>
			{#each data.filament.variants as variant}
				<VariantCard
					{variant}
					brandName={data.brand.name}
					materialName={data.material.name}
					filamentName={data.filament.name}
				/>
			{/each}
		</FolderGrid>
	</div>
</div>
