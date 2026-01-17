<script lang="ts">
	import { onMount } from 'svelte';
	import type { Store, Brand } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { env } from '$env/dynamic/public';

	let stores: Store[] = $state([]);
	let brands: Brand[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	onMount(async () => {
		try {
			const index = await db.loadIndex();
			stores = index.stores;
			brands = index.brands;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load database';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Filament Database Editor</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<header class="mb-12">
		<h1 class="text-4xl font-bold mb-3">Filament Database Editor</h1>
		<p class="text-lg text-muted-foreground">Browse and edit filament stores, brands, materials, and filaments</p>
	</header>

	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
		</div>
	{:else if error}
		<div class="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
			<p class="text-destructive">Error: {error}</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-8">
			<section class="bg-card dark:bg-card rounded-lg border border-border p-6">
				<div class="flex items-center justify-between mb-6">
					<div>
						<h2 class="text-2xl font-semibold mb-2">Brands</h2>
						<p class="text-muted-foreground">Browse and edit filament brands</p>
					</div>
					<span class="text-3xl font-bold text-green-600">{brands.length}</span>
				</div>
				<a
					href="/brands"
					class="inline-flex bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-md font-medium"
				>
					View All Brands →
				</a>
			</section>

			<section class="bg-card dark:bg-card rounded-lg border border-border p-6">
				<div class="flex items-center justify-between mb-6">
					<div>
						<h2 class="text-2xl font-semibold mb-2">Stores</h2>
						<p class="text-muted-foreground">Browse and edit filament stores</p>
					</div>
					<span class="text-3xl font-bold text-primary">{stores.length}</span>
				</div>
				<a
					href="/stores"
					class="inline-flex bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium"
				>
					View All Stores →
				</a>
			</section>

			<section class="bg-card dark:bg-card rounded-lg border border-border p-6">
				<div class="flex items-center justify-between mb-6">
					<div>
						<h2 class="text-2xl font-semibold mb-2">FAQ</h2>
						<p class="text-muted-foreground">If you've got any questions, we've got answers.</p>
					</div>
				</div>
				<a
					href="/faq"
					class="inline-flex bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium"
				>
					View Our FAQ →
				</a>
			</section>

			<section class="bg-card dark:bg-card rounded-lg border border-border p-6">
				<div class="flex items-center justify-between mb-6">
					<div>
						<h2 class="text-2xl font-semibold mb-2">API</h2>
						<p class="text-muted-foreground">Want to use our data? take a look at our API documentation.</p>
					</div>
				</div>
				<a
					href={env.PUBLIC_API_BASE_URL}
					class="inline-flex bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-md font-medium"
				>
					View Our API →
				</a>
			</section>
		</div>
	{/if}
</div>
