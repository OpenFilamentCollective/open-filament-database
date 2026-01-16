<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ChangesMenu } from '$lib/components/layout';
	import { isLocalMode } from '$lib/stores/environment';
	import { db } from '$lib/services/database';
	import { page } from '$app/stores';
	import { env } from '$env/dynamic/public';

	let { children } = $props();

	let refreshing = $state(false);

	async function handleRefresh() {
		refreshing = true;
		try {
			// Clear the database cache
			db.clearCache();
			// Reload the current page
			window.location.reload();
		} finally {
			refreshing = false;
		}
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen flex flex-col">
	<header class="bg-white border-b border-gray-200">
		<div class="container mx-auto px-4 py-3 flex justify-between items-center">
			<div class="flex items-center gap-6">
				<a href="/" class="text-xl font-bold text-gray-800 hover:text-gray-600">
					Filament Database
				</a>
				<nav class="flex items-center gap-4">
					<a
						href="/brands"
						class="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
					>
						Brands
					</a>
					<a
						href="/stores"
						class="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
					>
						Stores
					</a>
					<a
						href="/faq"
						class="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
					>
						FAQ
					</a>
					<a
						href={env.PUBLIC_API_BASE_URL}
						class="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
					>
						API
					</a>
				</nav>
			</div>
			<div class="flex items-center gap-3">
				{#if $isLocalMode}
					<button
						onclick={handleRefresh}
						disabled={refreshing}
						class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
						title="Refresh data from filesystem"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 {refreshing ? 'animate-spin' : ''}"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
								clip-rule="evenodd"
							/>
						</svg>
						<span class="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
					</button>
				{:else}
					<ChangesMenu />
				{/if}
			</div>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>
