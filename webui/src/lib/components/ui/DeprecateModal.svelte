<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import SearchBar from './SearchBar.svelte';
	import { loadSearchIndex, searchRecords } from '$lib/services/searchIndex';
	import type { SearchRecord } from '$lib/types/search';

	interface Props {
		show: boolean;
		/** Display name of the entity being deprecated (the source). */
		sourceName: string;
		/** Canonical UUID of the source, if CI has assigned one yet. */
		sourceUuid?: string;
		/** Change-tree path of the source — excluded from results (can't map to itself). */
		sourcePath: string;
		/** True while the parent is applying the redirect + deletion. */
		saving?: boolean;
		onClose: () => void;
		/** Called with the chosen replacement filament when the user confirms. */
		onConfirm: (target: SearchRecord) => void;
	}

	let { show, sourceName, sourceUuid, sourcePath, saving = false, onClose, onConfirm }: Props =
		$props();

	let query = $state('');
	let records = $state<SearchRecord[]>([]);
	let selected = $state<SearchRecord | null>(null);
	let loadError = $state<string | null>(null);
	let loadingIndex = $state(false);
	let loaded = $state(false);

	// Load the flat search index the first time the modal opens; reset the picker on close.
	$effect(() => {
		if (!show) {
			query = '';
			selected = null;
			return;
		}
		if (loaded || loadingIndex) return;
		loadingIndex = true;
		loadError = null;
		loadSearchIndex()
			.then((r) => {
				records = r;
				loaded = true;
			})
			.catch((e) => {
				loadError = e instanceof Error ? e.message : 'Failed to load filaments';
			})
			.finally(() => {
				loadingIndex = false;
			});
	});

	// Filament-only matches, excluding the source itself. Empty query → no results.
	const results = $derived.by(() => {
		if (!query.trim()) return [] as SearchRecord[];
		const { results: matched } = searchRecords(records, query, {
			types: ['filament'],
			pageSize: 20
		});
		return matched.filter((r) => r.path.toLowerCase() !== sourcePath.toLowerCase());
	});

	function context(r: SearchRecord): string {
		return [r.brandName, r.materialType].filter(Boolean).join(' · ');
	}

	function confirm() {
		if (selected) onConfirm(selected);
	}
</script>

<Modal {show} title="Deprecate & redirect filament" {onClose} maxWidth="lg" height="2/3">
	<div class="flex flex-col h-full min-h-0 gap-4">
		<div class="space-y-2 flex-shrink-0">
			<p class="text-sm text-foreground">
				Pick a replacement for <strong>{sourceName}</strong>. This deletes
				<strong>{sourceName}</strong> and
				{#if sourceUuid}
					records its UUID on the replacement's <code>moved_from</code> list
				{:else}
					maps it to the replacement
				{/if}
				so existing references resolve to the replacement.
			</p>
			{#if sourceUuid}
				<p class="text-xs text-muted-foreground">
					Source UUID: <code>{sourceUuid}</code>
				</p>
			{:else}
				<p class="text-xs text-amber-600 dark:text-amber-400">
					This filament has no canonical UUID yet (CI assigns one on merge), so no redirect will be
					recorded — it will simply be deleted.
				</p>
			{/if}
		</div>

		<div class="flex-shrink-0">
			<SearchBar
				value={query}
				oninput={(v) => (query = v)}
				placeholder="Search filaments by name, brand, material…"
				captureKeystrokes={false}
			/>
		</div>

		<div class="flex-1 overflow-auto min-h-0 rounded-md border border-border">
			{#if loadingIndex}
				<p class="p-4 text-sm text-muted-foreground">Loading filaments…</p>
			{:else if loadError}
				<p class="p-4 text-sm text-destructive">{loadError}</p>
			{:else if !query.trim()}
				<p class="p-4 text-sm text-muted-foreground">Type to search for a replacement filament.</p>
			{:else if results.length === 0}
				<p class="p-4 text-sm text-muted-foreground">No matching filaments found.</p>
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
								onclick={() => (selected = record)}
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
			<div class="flex-shrink-0 rounded bg-muted/50 p-2 text-sm text-foreground">
				Redirect to: <strong>{selected.name}</strong>
				{#if context(selected)}
					<span class="text-muted-foreground">({context(selected)})</span>
				{/if}
			</div>
		{/if}

		<div class="flex flex-shrink-0 justify-end gap-2 pt-2">
			<Button onclick={onClose} disabled={saving} variant="secondary">Cancel</Button>
			<Button onclick={confirm} disabled={saving || !selected} variant="destructive">
				{saving ? 'Applying…' : 'Deprecate & redirect'}
			</Button>
		</div>
	</div>
</Modal>
