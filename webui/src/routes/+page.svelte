<script lang="ts">
	import { onMount } from 'svelte';
	import type { Store, Brand } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { env } from '$env/dynamic/public';

	let stores: Store[] = $state([]);
	let brands: Brand[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let goodToKnowOpen = $state(false);

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
	<title>Open Filament Database</title>
</svelte:head>

<div class="container mx-auto px-6 py-10">
	<header class="mb-10">
		<h1 class="mb-2 text-3xl font-bold tracking-tight">Open Filament Database</h1>
		<p class="text-lg text-muted-foreground">
			A community-driven, open-source database of 3D printing filament information, hosted by the
			<a href="https://github.com/OpenFilamentCollective" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Open Filament Collective</a>,
			currently facilitated by
			<a href="https://simplyprint.io" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">SimplyPrint</a>.
			Anyone can contribute &mdash; whether you're a hobbyist, print farm, or brand.
		</p>
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
		<!-- How it works flow -->
		<section class="mb-10 rounded-lg border bg-card p-6 shadow-sm">
			<h2 class="mb-6 text-xl font-semibold">How Contributing Works</h2>
			<div class="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-0">
				<!-- Step 1: Browse -->
				<div class="flex flex-col items-center gap-1.5 px-4 py-2">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
						</svg>
					</div>
					<span class="text-sm font-medium">Browse</span>
				</div>

				<div class="h-6 w-px shrink-0 bg-border/50 sm:h-px sm:w-8"></div>

				<!-- Step 2: Edit -->
				<div class="flex flex-col items-center gap-1.5 px-4 py-2">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
						</svg>
					</div>
					<span class="text-sm font-medium">Edit</span>
				</div>

				<div class="h-6 w-px shrink-0 bg-border/50 sm:h-px sm:w-8"></div>

				<!-- Step 3: Submit -->
				<div class="flex flex-col items-center gap-1.5 px-4 py-2">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
						</svg>
					</div>
					<span class="text-sm font-medium">Submit</span>
				</div>

				<div class="h-6 w-px shrink-0 bg-border/50 sm:h-px sm:w-8"></div>

				<!-- Step 4: Review -->
				<div class="flex flex-col items-center gap-1.5 px-4 py-2">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
						</svg>
					</div>
					<span class="text-sm font-medium">Review</span>
				</div>

				<div class="h-6 w-px shrink-0 bg-border/50 sm:h-px sm:w-8"></div>

				<!-- Step 5: Live -->
				<div class="flex flex-col items-center gap-1.5 px-4 py-2">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
						</svg>
					</div>
					<span class="text-sm font-medium">Live</span>
				</div>
			</div>
			<p class="mt-4 text-center text-sm text-muted-foreground">
				Make your edits in the browser, submit your changes, and they'll be reviewed by a maintainer as soon as possible (usually within 2 days).
			</p>
		</section>

		<!-- Data cards -->
		<div class="mb-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
					<span class="ml-2">&rarr;</span>
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
					<span class="ml-2">&rarr;</span>
				</a>
			</section>

			{#if env.PUBLIC_API_BASE_URL}
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
					<span class="ml-2">&rarr;</span>
				</a>
			</section>
			{/if}
		</div>

		<!-- Good to know -->
		<section class="rounded-lg border bg-card shadow-sm">
			<button
				onclick={() => goodToKnowOpen = !goodToKnowOpen}
				class="flex w-full cursor-pointer items-center justify-between p-6 text-left"
			>
				<h2 class="text-lg font-semibold">Good to Know</h2>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5 text-muted-foreground transition-transform {goodToKnowOpen ? 'rotate-180' : ''}"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
				</svg>
			</button>
			{#if goodToKnowOpen}
				<div class="space-y-3 border-t px-6 pb-6 pt-4 text-sm text-muted-foreground">
					<p><strong class="text-foreground">Your changes are saved in your browser</strong> using localStorage. They persist across sessions on the same device, but are not synced to other devices.</p>
					<p><strong class="text-foreground">Storage limit:</strong> Browsers typically allow 5-10 MB per site. Images are stored as base64 which adds ~33% overhead, so export/submit regularly if working with many images.</p>
					<p><strong class="text-foreground">No GitHub account needed:</strong> You can submit changes anonymously. If you want credit on the contribution, you can optionally sign in with GitHub.</p>
					<p><strong class="text-foreground">Validation:</strong> Your changes are validated before submission to catch errors early. You can also re-run validation at any time from the submit dialog.</p>
				</div>
			{/if}
		</section>
	{/if}
</div>
