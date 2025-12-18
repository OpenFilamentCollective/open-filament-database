<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Open Filament Database</title>
</svelte:head>

<div class="space-y-8">
	<div class="text-center">
		<h1 class="text-4xl font-bold text-gray-900 dark:text-white">Open Filament Database</h1>
		<p class="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
			A community-driven database of 3D printing filaments. Browse brands, materials, and color variants from manufacturers around the world.
		</p>
	</div>

	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
		<div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
			<p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.stats.brands}</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">Brands</p>
		</div>
		<div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
			<p class="text-2xl font-bold text-green-600 dark:text-green-400">{data.stats.materials}</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">Materials</p>
		</div>
		<div class="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
			<p class="text-2xl font-bold text-purple-600 dark:text-purple-400">{data.stats.filaments}</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">Filaments</p>
		</div>
		<div class="rounded-lg bg-orange-50 p-4 dark:bg-orange-900/20">
			<p class="text-2xl font-bold text-orange-600 dark:text-orange-400">{data.stats.variants}</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">Color Variants</p>
		</div>
	</div>

	<div class="grid gap-6 sm:grid-cols-2">
		<a
			href="/brands"
			class="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
		>
			<div class="flex items-center gap-4">
				<div class="flex h-14 w-14 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
					<svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
					</svg>
				</div>
				<div class="flex-1">
					<h2 class="text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
						Brands
					</h2>
					<p class="text-gray-600 dark:text-gray-400">
						Browse {data.stats.brands} filament manufacturers
					</p>
				</div>
				<svg class="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</div>
		</a>

		<a
			href="/stores"
			class="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-green-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-green-600"
		>
			<div class="flex items-center gap-4">
				<div class="flex h-14 w-14 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
					<svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
					</svg>
				</div>
				<div class="flex-1">
					<h2 class="text-xl font-semibold text-gray-900 group-hover:text-green-600 dark:text-white dark:group-hover:text-green-400">
						Stores
					</h2>
					<p class="text-gray-600 dark:text-gray-400">
						Find {data.stats.stores} retailers worldwide
					</p>
				</div>
				<svg class="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</div>
		</a>
	</div>
</div>
