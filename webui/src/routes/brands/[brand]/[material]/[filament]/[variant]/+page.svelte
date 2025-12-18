<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';

	let { data } = $props();

	const breadcrumbs = [
		{ label: data.brand.name, href: `/brands/${encodeURIComponent(data.brand.name)}` },
		{
			label: data.material.data.material,
			href: `/brands/${encodeURIComponent(data.brand.name)}/${encodeURIComponent(data.material.name)}`
		},
		{
			label: data.filament.data.name,
			href: `/brands/${encodeURIComponent(data.brand.name)}/${encodeURIComponent(data.material.name)}/${encodeURIComponent(data.filament.name)}`
		},
		{ label: data.variant.data.color_name }
	];

	// Handle single color or array of colors
	const colors = Array.isArray(data.variant.data.color_hex)
		? data.variant.data.color_hex
		: [data.variant.data.color_hex];

	const primaryColor = colors[0];
	const normalizedColor = primaryColor.startsWith('#') ? primaryColor : '#' + primaryColor;

	// Get store info for purchase links
	function getStore(storeId: string) {
		return data.stores.find((s) => s.id === storeId);
	}
</script>

<svelte:head>
	<title>{data.variant.data.color_name} - {data.filament.data.name} - Open Filament Database</title>
</svelte:head>

<div class="space-y-6">
	<Breadcrumb items={breadcrumbs} />

	<div class="flex flex-col gap-6 lg:flex-row">
		<div
			class="relative h-48 w-full overflow-hidden rounded-xl lg:h-64 lg:w-64"
			style="background-color: {normalizedColor}"
		>
			{#if colors.length > 1}
				<div class="absolute inset-0 flex">
					{#each colors as color}
						<div
							class="h-full flex-1"
							style="background-color: {color.startsWith('#') ? color : '#' + color}"
						></div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="flex-1">
			<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
				{data.variant.data.color_name}
			</h1>
			<p class="mt-1 text-gray-600 dark:text-gray-400">
				{data.brand.name} {data.filament.data.name}
			</p>

			<div class="mt-4 flex flex-wrap gap-2">
				{#each colors as color}
					<span
						class="rounded-lg bg-gray-100 px-3 py-1 font-mono text-sm dark:bg-gray-700 dark:text-gray-200"
					>
						{color.startsWith('#') ? color.toUpperCase() : '#' + color.toUpperCase()}
					</span>
				{/each}
			</div>

			{#if data.variant.data.discontinued}
				<span
					class="mt-4 inline-block rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900 dark:text-red-200"
				>
					Discontinued
				</span>
			{/if}

			{#if data.variant.data.traits}
				<div class="mt-4 flex flex-wrap gap-2">
					{#if data.variant.data.traits.translucent}
						<span
							class="rounded-full bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200"
						>
							Translucent
						</span>
					{/if}
					{#if data.variant.data.traits.glow}
						<span
							class="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200"
						>
							Glow in Dark
						</span>
					{/if}
					{#if data.variant.data.traits.matte}
						<span
							class="rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-600 dark:text-gray-200"
						>
							Matte
						</span>
					{/if}
					{#if data.variant.data.traits.recycled}
						<span
							class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200"
						>
							Recycled
						</span>
					{/if}
					{#if data.variant.data.traits.recyclable}
						<span
							class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200"
						>
							Recyclable
						</span>
					{/if}
					{#if data.variant.data.traits.biodegradable}
						<span
							class="rounded-full bg-lime-100 px-2 py-1 text-xs font-medium text-lime-700 dark:bg-lime-900 dark:text-lime-200"
						>
							Biodegradable
						</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#if data.variant.data.color_standards}
		<div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
			<h3 class="font-semibold text-gray-900 dark:text-white">Color Standards</h3>
			<dl class="mt-2 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
				{#if data.variant.data.color_standards.ral}
					<div>
						<dt class="text-gray-500 dark:text-gray-400">RAL</dt>
						<dd class="font-medium text-gray-900 dark:text-white">
							{data.variant.data.color_standards.ral}
						</dd>
					</div>
				{/if}
				{#if data.variant.data.color_standards.pantone}
					<div>
						<dt class="text-gray-500 dark:text-gray-400">Pantone</dt>
						<dd class="font-medium text-gray-900 dark:text-white">
							{data.variant.data.color_standards.pantone}
						</dd>
					</div>
				{/if}
				{#if data.variant.data.color_standards.ncs}
					<div>
						<dt class="text-gray-500 dark:text-gray-400">NCS</dt>
						<dd class="font-medium text-gray-900 dark:text-white">
							{data.variant.data.color_standards.ncs}
						</dd>
					</div>
				{/if}
				{#if data.variant.data.color_standards.bs}
					<div>
						<dt class="text-gray-500 dark:text-gray-400">BS</dt>
						<dd class="font-medium text-gray-900 dark:text-white">
							{data.variant.data.color_standards.bs}
						</dd>
					</div>
				{/if}
				{#if data.variant.data.color_standards.munsell}
					<div>
						<dt class="text-gray-500 dark:text-gray-400">Munsell</dt>
						<dd class="font-medium text-gray-900 dark:text-white">
							{data.variant.data.color_standards.munsell}
						</dd>
					</div>
				{/if}
			</dl>
		</div>
	{/if}

	{#if data.variant.sizes.length > 0}
		<div>
			<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
				Available Sizes ({data.variant.sizes.length})
			</h2>
			<div class="space-y-4">
				{#each data.variant.sizes as size}
					<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
						<div class="flex flex-wrap items-center justify-between gap-4">
							<div>
								<h4 class="font-medium text-gray-900 dark:text-white">
									{size.filament_weight}g - {size.diameter}mm
								</h4>
								<div class="mt-1 flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
									{#if size.empty_spool_weight}
										<span>Spool: {size.empty_spool_weight}g</span>
									{/if}
									{#if size.ean}
										<span>EAN: {size.ean}</span>
									{/if}
									{#if size.article_number}
										<span>Article: {size.article_number}</span>
									{/if}
								</div>
							</div>

							{#if size.discontinued}
								<span
									class="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-200"
								>
									Discontinued
								</span>
							{/if}
						</div>

						{#if size.purchase_links && size.purchase_links.length > 0}
							<div class="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
								<h5 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
									Purchase Links
								</h5>
								<div class="flex flex-wrap gap-2">
									{#each size.purchase_links as link}
										{@const store = getStore(link.store_id)}
										<a
											href={link.url}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200"
										>
											{store?.data.name || link.store_id}
											{#if link.spool_refill}
												<span
													class="ml-1 rounded bg-green-200 px-1 py-0.5 text-xs text-green-800 dark:bg-green-800 dark:text-green-200"
												>
													Refill
												</span>
											{/if}
											{#if link.affiliate}
												<span
													class="ml-1 rounded bg-purple-200 px-1 py-0.5 text-xs text-purple-800 dark:bg-purple-800 dark:text-purple-200"
												>
													Affiliate
												</span>
											{/if}
										</a>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
