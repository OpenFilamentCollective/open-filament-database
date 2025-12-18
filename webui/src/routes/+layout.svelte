<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ChangeIndicator from '$lib/components/ChangeIndicator.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<header class="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80">
		<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
			<div class="flex items-center gap-6">
				<a href="/" class="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
					<svg class="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
						/>
					</svg>
					<span class="hidden sm:inline">Open Filament DB</span>
				</a>

				<nav class="flex items-center gap-4">
					<a
						href="/"
						class="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
					>
						Brands
					</a>
					<a
						href="/stores"
						class="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
					>
						Stores
					</a>
				</nav>
			</div>

			<div class="flex items-center gap-4">
				<ChangeIndicator />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		{@render children()}
	</main>

	<footer class="border-t border-gray-200 bg-white py-8 dark:border-gray-800 dark:bg-gray-900">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<p class="text-center text-sm text-gray-500 dark:text-gray-400">
				Open Filament Database - Community-driven 3D printing filament data
			</p>
		</div>
	</footer>
</div>
