<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import SearchBar from './SearchBar.svelte';
	import { loadSearchIndex, layerChanges, searchRecords } from '$lib/services/searchIndex';
	import {
		loadVariantTargets,
		type RedirectSource,
		type RedirectTarget
	} from '$lib/services/redirectService';
	import { changesList } from '$lib/stores/changes';
	import { submittedStore, submittedCount } from '$lib/stores/submitted';
	import { useChangeTracking } from '$lib/stores/environment';
	import type { SearchEntityType, SearchRecord } from '$lib/types/search';
	import type { EntityPath } from '$lib/types/changeTree';

	interface Props {
		show: boolean;
		/** The entity being deleted. `null` while the modal is closed. */
		source: RedirectSource | null;
		/** The entity exists only as a local `create` change. */
		isLocalCreate?: boolean;
		/** What else this delete takes with it, e.g. "…all variants within this filament." */
		cascadeWarning?: string;
		/** True while the parent applies the deletion. */
		busy?: boolean;
		/** True while the parent is still looking up the source's canonical UUID —
		 * neither pane can be chosen until it lands. */
		resolving?: boolean;
		/** Failure from the parent's last attempt — shown here, since a page banner
		 * would sit behind the backdrop. */
		error?: string | null;
		onClose: () => void;
		/** Confirmed. `null` means the user chose to delete without recording a redirect. */
		onConfirm: (target: RedirectTarget | null) => void;
	}

	let {
		show,
		source,
		isLocalCreate = false,
		cascadeWarning,
		busy = false,
		resolving = false,
		error = null,
		onClose,
		onConfirm
	}: Props = $props();

	/** Which index type holds a replacement. Variants aren't indexed — find their filament first. */
	const PICKER_TYPE: Record<EntityPath['type'], SearchEntityType> = {
		brand: 'brand',
		material: 'material',
		filament: 'filament',
		store: 'store',
		variant: 'filament'
	};

	/** `null` until the source's identity is known and a pane can be chosen. */
	let mode = $state<'redirect' | 'confirm' | null>(null);
	let step = $state<'pick-parent' | 'pick-variant'>('pick-parent');
	let query = $state('');
	let records = $state<SearchRecord[]>([]);
	let selected = $state<RedirectTarget | null>(null);
	let parentRecord = $state<SearchRecord | null>(null);
	let variantOptions = $state<RedirectTarget[]>([]);
	let loadingVariants = $state(false);
	let loadingIndex = $state(false);
	let loadError = $state<string | null>(null);

	const label = $derived(source?.label ?? 'Entry');
	const typeName = $derived(label.toLowerCase());
	const isVariant = $derived(source?.type === 'variant');

	/** No UUID (or not in the repo yet) means there is nothing a redirect could record. */
	const canRedirect = $derived(!!source?.uuid?.trim() && !isLocalCreate);

	// Staged edits layered over the base index, so entries already marked for deletion
	// aren't offered as replacements and locally created ones are.
	const submittedChanges = $derived.by(() => {
		void $submittedCount;
		return submittedStore.getEntries().flatMap((e) => e.changes);
	});
	const layered = $derived(
		$useChangeTracking ? layerChanges(records, $changesList, submittedChanges) : records
	);

	const results = $derived.by(() => {
		if (!source || !query.trim()) return [] as SearchRecord[];
		const { results: matched } = searchRecords(layered, query, {
			types: [PICKER_TYPE[source.type]],
			pageSize: 20
		});
		// A variant search lists filaments — the source's own filament is a valid pick,
		// since a sibling variant is the likeliest replacement.
		if (isVariant) return matched;
		const sourcePath = source.path.toLowerCase();
		return matched.filter((r) => r.path.toLowerCase() !== sourcePath);
	});

	// Open in the redirect pane whenever a redirect is possible, and reset the picker.
	// Deferred until `resolving` clears, so a child card whose UUID is still being
	// fetched doesn't flash the "nothing to redirect" pane.
	$effect(() => {
		if (!show) {
			untrack(() => (mode = null));
			return;
		}
		if (resolving) return;
		untrack(() => {
			if (mode !== null) return;
			mode = canRedirect ? 'redirect' : 'confirm';
			step = 'pick-parent';
			query = '';
			selected = null;
			parentRecord = null;
			variantOptions = [];
			loadError = null;
			void loadIndex();
		});
	});

	async function loadIndex() {
		if (records.length > 0 || loadingIndex) return;
		loadingIndex = true;
		try {
			records = await loadSearchIndex();
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load the search index';
		} finally {
			loadingIndex = false;
		}
	}

	function context(r: SearchRecord): string {
		return [r.brandName, r.materialType].filter(Boolean).join(' · ');
	}

	function pickRecord(record: SearchRecord) {
		if (isVariant) {
			parentRecord = record;
			selected = null;
			step = 'pick-variant';
			void loadVariants(record);
			return;
		}
		selected = {
			path: record.path,
			name: record.name,
			href: record.href,
			context: context(record)
		};
	}

	async function loadVariants(record: SearchRecord) {
		loadingVariants = true;
		loadError = null;
		try {
			const sourcePath = source?.path.toLowerCase() ?? '';
			const targets = await loadVariantTargets(record.path);
			variantOptions = targets.filter((t) => t.path.toLowerCase() !== sourcePath);
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load variants';
			variantOptions = [];
		} finally {
			loadingVariants = false;
		}
	}

	function backToParents() {
		step = 'pick-parent';
		selected = null;
		parentRecord = null;
		variantOptions = [];
	}
</script>

<Modal
	{show}
	title="Delete {label}"
	{onClose}
	maxWidth={mode === 'redirect' ? 'lg' : 'md'}
	height={mode === 'redirect' ? '2/3' : 'auto'}
>
	{#if source}
		{#if mode === null}
			<p class="py-6 text-sm text-muted-foreground" aria-live="polite">Loading…</p>
		{:else if mode === 'redirect'}
			<div class="flex h-full min-h-0 flex-col gap-4" aria-live="polite">
				<div class="shrink-0 space-y-2">
					<p class="text-sm text-foreground">
						Pick what replaces <strong>{source.name}</strong>. This deletes it and records its UUID
						on the replacement's <code>moved_from</code>, so existing references resolve to the
						replacement instead of breaking.
					</p>
					<p class="text-xs text-muted-foreground">
						UUID: <code>{source.uuid}</code>
					</p>
					{#if cascadeWarning}
						<p class="text-xs text-amber-600 dark:text-amber-400">
							{cascadeWarning} Only this {typeName}'s own UUID is redirected — its descendants'
							UUIDs are not.
						</p>
					{/if}
				</div>

				{#if step === 'pick-variant' && parentRecord}
					<div class="flex shrink-0 items-center justify-between gap-2">
						<p class="truncate text-sm text-muted-foreground">
							Variants of <strong class="text-foreground">{parentRecord.name}</strong>
							{#if context(parentRecord)}
								<span>({context(parentRecord)})</span>
							{/if}
						</p>
						<Button onclick={backToParents} disabled={busy} variant="ghost" size="sm">
							← Change filament
						</Button>
					</div>
				{:else}
					<div class="shrink-0">
						<SearchBar
							value={query}
							oninput={(v) => (query = v)}
							placeholder={isVariant
								? 'Search for the replacement’s filament…'
								: `Search ${typeName}s by name…`}
							captureKeystrokes={false}
						/>
					</div>
				{/if}

				<div class="min-h-0 flex-1 overflow-auto rounded-md border border-border">
					{#if loadError}
						<p class="p-4 text-sm text-destructive">{loadError}</p>
					{:else if step === 'pick-variant'}
						{#if loadingVariants}
							<p class="p-4 text-sm text-muted-foreground">Loading variants…</p>
						{:else if variantOptions.length === 0}
							<p class="p-4 text-sm text-muted-foreground">
								That filament has no other variants to redirect to.
							</p>
						{:else}
							<ul>
								{#each variantOptions as target (target.path)}
									<li>
										<button
											type="button"
											class="w-full border-b border-border px-4 py-2 text-left last:border-b-0 hover:bg-muted focus:bg-muted focus:outline-none {selected?.path ===
											target.path
												? 'bg-primary/10'
												: ''}"
											onclick={() => (selected = target)}
										>
											<div class="text-sm font-medium text-foreground">{target.name}</div>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					{:else if loadingIndex}
						<p class="p-4 text-sm text-muted-foreground">Loading…</p>
					{:else if !query.trim()}
						<p class="p-4 text-sm text-muted-foreground">
							{isVariant
								? 'Type to find the filament the replacement lives in.'
								: `Type to search for a replacement ${typeName}.`}
						</p>
					{:else if results.length === 0}
						<p class="p-4 text-sm text-muted-foreground">No matches found.</p>
					{:else}
						<ul>
							{#each results as record (record.path)}
								<li>
									<button
										type="button"
										class="w-full border-b border-border px-4 py-2 text-left last:border-b-0 hover:bg-muted focus:bg-muted focus:outline-none {selected?.path ===
										record.path
											? 'bg-primary/10'
											: ''}"
										onclick={() => pickRecord(record)}
									>
										<div class="text-sm font-medium text-foreground">{record.name}</div>
										{#if context(record)}
											<div class="text-xs text-muted-foreground">{context(record)}</div>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				{#if selected}
					<div class="shrink-0 rounded bg-muted/50 p-2 text-sm text-foreground">
						Redirect to: <strong>{selected.name}</strong>
						{#if selected.context}
							<span class="text-muted-foreground">({selected.context})</span>
						{/if}
					</div>
				{/if}

				{#if error}
					<p class="shrink-0 text-sm text-destructive">{error}</p>
				{/if}

				<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 pt-2">
					<Button onclick={() => (mode = 'confirm')} disabled={busy} variant="ghost" size="sm">
						Can't be redirected…
					</Button>
					<div class="flex gap-2">
						<Button onclick={onClose} disabled={busy} variant="secondary">Cancel</Button>
						<Button
							onclick={() => selected && onConfirm(selected)}
							disabled={busy || !selected}
							variant="destructive"
						>
							{busy ? 'Applying…' : 'Redirect & delete'}
						</Button>
					</div>
				</div>
			</div>
		{:else}
			<div class="space-y-4" aria-live="polite">
				<p class="text-foreground">
					Are you sure you want to delete <strong>{source.name}</strong>?
				</p>

				{#if cascadeWarning}
					<p class="text-sm text-muted-foreground">{cascadeWarning}</p>
				{/if}

				{#if canRedirect}
					<div class="rounded border border-destructive/20 bg-destructive/10 p-3">
						<p class="text-sm text-destructive">
							No redirect will be recorded, so anything still pointing at this {typeName}'s UUID
							will stop resolving.
						</p>
					</div>
				{:else if !isLocalCreate}
					<div class="rounded border border-amber-500/30 bg-amber-500/10 p-3">
						<p class="text-sm text-amber-700 dark:text-amber-400">
							This {typeName} has no canonical UUID yet — CI assigns one on merge — so there is nothing
							to redirect. It can only be deleted.
						</p>
					</div>
				{/if}

				<div class="rounded border border-primary/20 bg-primary/10 p-3">
					<p class="text-sm text-primary">
						{#if isLocalCreate}
							This will remove the locally created item. The change will be discarded.
						{:else}
							This will mark the item for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>

				{#if error}
					<p class="text-sm text-destructive">{error}</p>
				{/if}

				<div class="flex flex-wrap items-center justify-between gap-2 pt-4">
					{#if canRedirect}
						<Button onclick={() => (mode = 'redirect')} disabled={busy} variant="ghost" size="sm">
							← Redirect instead
						</Button>
					{:else}
						<span></span>
					{/if}
					<div class="flex gap-2">
						<Button onclick={onClose} disabled={busy} variant="secondary">Cancel</Button>
						<Button onclick={() => onConfirm(null)} disabled={busy} variant="destructive">
							{busy ? 'Deleting...' : 'Delete'}
						</Button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</Modal>
