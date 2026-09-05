<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { SearchRecord, SearchEntityType, GtinIndexFile } from '$lib/types/search';
	import {
		loadSearchIndex,
		loadGtinIndex,
		gtinRecordsFor,
		layerChanges,
		searchRecords
	} from '$lib/services/searchIndex';
	import { looksLikeBarcode } from '$lib/utils/gtin';
	import { EntityCard } from '$lib/components/entity';
	import { BackButton } from '$lib/components';
	import { changes, changesList } from '$lib/stores/changes';
	import { submittedStore, submittedCount } from '$lib/stores/submitted';
	import { useChangeTracking } from '$lib/stores/environment';
	import { getChildChangeProps, NO_CHANGES, type ChangeProps } from '$lib/utils/deletedStubs';

	const PAGE_SIZE = 24;

	const TYPE_FILTERS: { label: string; value: SearchEntityType | null }[] = [
		{ label: 'All', value: null },
		{ label: 'Brands', value: 'brand' },
		{ label: 'Materials', value: 'material' },
		{ label: 'Filaments', value: 'filament' },
		{ label: 'Stores', value: 'store' }
		// No 'variant' chip: the name index holds no variants, so variant records only
		// ever arrive as barcode hits — where every result is already a variant. The
		// filter could only ever return nothing, or everything.
	];

	let baseRecords: SearchRecord[] = $state([]);
	// Only ever populated for a barcode query — see the $effect below.
	let gtinIndex: GtinIndexFile | null = $state(null);
	let loading = $state(true);
	let error: string | null = $state(null);

	// URL is the source of truth for query/page/type.
	let query = $derived($page.url.searchParams.get('q') ?? '');
	let currentPage = $derived(Math.max(1, parseInt($page.url.searchParams.get('page') ?? '1', 10) || 1));
	let typeFilter = $derived(($page.url.searchParams.get('type') as SearchEntityType | null) ?? null);

	// Staged contributor edits, layered over the base index (reactive on the stores).
	let submittedChanges = $derived.by(() => {
		void $submittedCount; // track submissions
		return submittedStore.getEntries().flatMap((e) => e.changes);
	});

	let layered = $derived(
		$useChangeTracking ? layerChanges(baseRecords, $changesList, submittedChanges) : baseRecords
	);

	// A scanned GTIN/EAN/UPC resolves through a second index the name index doesn't
	// cover. Fetched only when the query looks like a barcode, so an ordinary search
	// never pays for it. The hits are searched alongside everything else (their
	// keywords carry both spellings of the code) and rank first by construction.
	$effect(() => {
		if (looksLikeBarcode(query) && !gtinIndex) {
			loadGtinIndex()
				.then((index) => (gtinIndex = index))
				// A missing or unpublished index just means no barcode matches.
				.catch(() => (gtinIndex = { count: 0, codes: {} }));
		}
	});

	let barcodeHits = $derived(gtinRecordsFor(gtinIndex, query));

	let searchable = $derived(barcodeHits.length > 0 ? [...barcodeHits, ...layered] : layered);

	let result = $derived(
		searchRecords(searchable, query, {
			page: currentPage,
			pageSize: PAGE_SIZE,
			types: typeFilter ? [typeFilter] : undefined
		})
	);

	onMount(async () => {
		try {
			baseRecords = await loadSearchIndex();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load search index';
		} finally {
			loading = false;
		}
	});

	function navigate(updates: { page?: number; type?: SearchEntityType | null }) {
		const params = new URLSearchParams($page.url.searchParams);
		if (updates.type !== undefined) {
			if (updates.type) params.set('type', updates.type);
			else params.delete('type');
			params.delete('page');
		}
		if (updates.page !== undefined) {
			if (updates.page > 1) params.set('page', String(updates.page));
			else params.delete('page');
		}
		const qs = params.toString();
		const url = `/search${qs ? `?${qs}` : ''}`;
		if (url !== $page.url.pathname + $page.url.search) {
			goto(url, { keepFocus: true, noScroll: true });
		}
	}

	// --- EntityCard prop helpers ---
	function entityId(r: SearchRecord): string | undefined {
		if (r.type === 'brand') return r.brandSlug;
		if (r.type === 'store') return r.path.split('/')[1];
		return undefined;
	}

	function logoEntityId(r: SearchRecord): string | undefined {
		if (r.type === 'brand') return r.brandSlug;
		if (r.type === 'store') return r.path.split('/')[1];
		return undefined;
	}

	function secondaryInfo(r: SearchRecord): string {
		switch (r.type) {
			case 'brand':
				return 'Brand';
			case 'store':
				return 'Store';
			case 'material':
				return r.brandName ?? 'Material';
			case 'filament':
				return [r.brandName, r.materialType].filter(Boolean).join(' · ');
			case 'variant':
				// Reached by barcode: the colour name alone doesn't identify the product,
				// and a shared code can land on two different filaments of one brand.
				return [r.brandName, r.filamentName, r.gtin && `GTIN ${r.gtin}`]
					.filter(Boolean)
					.join(' · ');
		}
	}

	function changeProps(r: SearchRecord): ChangeProps {
		if (!$useChangeTracking) return NO_CHANGES;
		return getChildChangeProps($changes, $useChangeTracking, r.path, submittedStore);
	}
</script>

<svelte:head>
	<title>{query ? `Search: ${query}` : 'Search'}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mb-6">
		<BackButton href="/" label="Home" />
		<h1 class="text-3xl font-bold">Search</h1>
		{#if query}
			<p class="text-muted-foreground mt-1">
				{result.total}
				{result.total === 1 ? 'result' : 'results'} for "{query}"
			</p>
		{:else}
			<p class="text-muted-foreground mt-1">Search across brands, stores, materials, and filaments.</p>
		{/if}
	</div>

	<!-- Type filter chips -->
	<div class="mb-6 flex flex-wrap gap-2">
		{#each TYPE_FILTERS as filter}
			{@const active = typeFilter === filter.value}
			<button
				type="button"
				onclick={() => navigate({ type: filter.value })}
				class="rounded-full px-3 py-1 text-sm font-medium transition-colors {active
					? 'bg-primary text-primary-foreground'
					: 'bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground'}"
			>
				{filter.label}
			</button>
		{/each}
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-16">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary"></div>
		</div>
	{:else if error}
		<div class="rounded-lg border-l-4 border-destructive bg-destructive/10 p-4">
			<p class="text-destructive">Error: {error}</p>
		</div>
	{:else if !query.trim()}
		<div class="rounded-lg border bg-card p-10 text-center text-muted-foreground shadow-sm">
			<p>Type in the search box above to find brands, stores, materials, and filaments.</p>
		</div>
	{:else if result.total === 0}
		<p class="text-muted-foreground">No results for "{query}".</p>
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each result.results as record (record.path)}
				{@const cp = changeProps(record)}
				<EntityCard
					entity={record}
					href={record.href}
					name={record.name}
					id={entityId(record)}
					logo={record.logo}
					logoType={record.type === 'brand' ? 'brand' : record.type === 'store' ? 'store' : undefined}
					logoEntityId={logoEntityId(record)}
					showLogo={record.type === 'brand' || record.type === 'store'}
					secondaryInfo={secondaryInfo(record)}
					badge={record.type === 'material' && record.materialType
						? { text: record.materialType, color: 'blue' }
						: undefined}
					hoverColor={record.type === 'material' ? 'purple' : record.type === 'store' ? 'blue' : 'green'}
					hasLocalChanges={cp.hasLocalChanges}
					localChangeType={cp.localChangeType}
					hasDescendantChanges={cp.hasDescendantChanges}
					hasSubmittedChanges={cp.hasSubmittedChanges}
					submittedChangeType={cp.submittedChangeType}
					submittedPrNumber={cp.submittedPrNumber}
				/>
			{/each}
		</div>

		{#if result.pageCount > 1}
			<div class="mt-8 flex items-center justify-center gap-4">
				<button
					type="button"
					onclick={() => navigate({ page: result.page - 1 })}
					disabled={result.page <= 1}
					class="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
				>
					&lsaquo; Prev
				</button>
				<span class="text-sm text-muted-foreground">
					Page {result.page} of {result.pageCount}
				</span>
				<button
					type="button"
					onclick={() => navigate({ page: result.page + 1 })}
					disabled={result.page >= result.pageCount}
					class="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
				>
					Next &rsaquo;
				</button>
			</div>
		{/if}
	{/if}
</div>
