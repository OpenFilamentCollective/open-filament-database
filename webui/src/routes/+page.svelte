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

<div class="container mx-auto px-6 py-10">
	<header class="mb-10">
		<h1 class="mb-2 text-3xl font-bold tracking-tight">Filament Database</h1>
		<p class="text-lg text-muted-foreground">Browse and edit filament stores, brands, materials, and filaments</p>
	</header>

	{#if loading}
		<div class="flex items-center justify-center py-16">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary"></div>
		</div>
	{:else if error}
		<div class="rounded-lg border-l-4 border-destructive bg-destructive/10 p-4">
			<p class="text-destructive">Error: {error}</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-6">
			<section class="rounded-lg border bg-card p-6 shadow-sm">
				<div class="mb-5 flex items-center justify-between">
					<div>
						<h2 class="mb-1 text-xl font-semibold">Brands</h2>
						<p class="text-sm text-muted-foreground">Browse and edit filament brands</p>
					</div>
					<span class="flex h-10 min-w-10 items-center justify-center rounded-md bg-secondary px-3 text-xl font-semibold">{brands.length}</span>
				</div>
				<a
					href="/brands"
					class="inline-flex items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					View All Brands
					<span class="ml-2">-></span>
				</a>
			</section>

			<section class="rounded-lg border bg-card p-6 shadow-sm">
				<div class="mb-5 flex items-center justify-between">
					<div>
						<h2 class="mb-1 text-xl font-semibold">Stores</h2>
						<p class="text-sm text-muted-foreground">Browse and edit filament stores</p>
					</div>
					<span class="flex h-10 min-w-10 items-center justify-center rounded-md bg-secondary px-3 text-xl font-semibold">{stores.length}</span>
				</div>
				<a
					href="/stores"
					class="inline-flex items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					View All Stores
					<span class="ml-2">-></span>
				</a>
			</section>

			<section class="rounded-lg border bg-card p-6 shadow-sm">
				<div class="mb-5 flex items-start justify-between">
					<div>
						<h2 class="mb-1 text-xl font-semibold">FAQ</h2>
						<p class="text-sm text-muted-foreground">If you've got any questions, we've got answers.</p>
					</div>
				</div>
				<a
					href="/faq"
					class="inline-flex items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					View Our FAQ
					<span class="ml-2">-></span>
				</a>
			</section>

			<section class="rounded-lg border bg-card p-6 shadow-sm">
				<div class="mb-5 flex items-start justify-between">
					<div>
						<h2 class="mb-1 text-xl font-semibold">API</h2>
						<p class="text-sm text-muted-foreground">Want to use our data? Take a look at our API documentation.</p>
					</div>
				</div>
				<a
					href={env.PUBLIC_API_BASE_URL}
					class="inline-flex items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					View Our API
					<span class="ml-2">-></span>
				</a>
			</section>
		</div>
	{/if}
</div>
