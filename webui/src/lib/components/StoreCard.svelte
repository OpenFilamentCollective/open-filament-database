<script lang="ts">
	import type { StoreIndex } from '$lib/server/dataIndex';
	import { overlayStore, buildOriginalPath } from '$lib/dataOverlay';
	import { getChangeByOriginalPath, addChange, removeChange } from '$lib/stores/changes.svelte';

	interface Props {
		store: StoreIndex;
		isLocalOnly?: boolean;
		onDelete?: () => void;
	}

	let { store, isLocalOnly = false, onDelete }: Props = $props();

	// Apply overlay to get effective data
	const overlay = overlayStore(store.data, store.id);
	const effectiveData = overlay.data;
	const hasLocalChanges = overlay.hasLocalChanges;

	// Compute logo URL from effective data
	function getLogoUrl(): string | null {
		const logo = effectiveData.logo;
		if (!logo) return null;
		if (logo.startsWith('data:')) return logo;
		if (logo.startsWith('<svg') || logo.startsWith('<?xml')) {
			return `data:image/svg+xml;base64,${btoa(logo)}`;
		}
		// Filename - would need server path but stores don't have logoPath yet
		return null;
	}

	const logoUrl = getLogoUrl();

	function getCountries(countries: string | string[]): string[] {
		if (Array.isArray(countries)) {
			return countries;
		}
		return [countries];
	}

	function handleDelete() {
		if (!confirm(`Are you sure you want to delete "${effectiveData.name}"?`)) return;

		const path = buildOriginalPath('store', store.id);
		const existingChange = getChangeByOriginalPath(path);

		if (existingChange?.operation === 'create') {
			// This was a locally created store, just remove the create change
			removeChange(existingChange.id);
		} else {
			// Mark as deleted
			addChange('delete', path, effectiveData as unknown as Record<string, unknown>);
		}

		onDelete?.();
	}
</script>

<div
	class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
	class:border-green-300={isLocalOnly}
	class:dark:border-green-700={isLocalOnly}
	class:border-amber-300={hasLocalChanges && !isLocalOnly}
	class:dark:border-amber-700={hasLocalChanges && !isLocalOnly}
>
	<div class="flex items-start gap-3">
		{#if logoUrl}
			<img
				src={logoUrl}
				alt="{effectiveData.name} logo"
				class="h-12 w-12 rounded-lg object-contain"
			/>
		{:else}
			<div
				class="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-400 dark:bg-gray-700"
			>
				{effectiveData.name.charAt(0)}
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<h3 class="truncate font-semibold text-gray-900 dark:text-white">
					{effectiveData.name}
				</h3>
				{#if isLocalOnly}
					<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200">
						New
					</span>
				{:else if hasLocalChanges}
					<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200">
						Modified
					</span>
				{/if}
			</div>
			<a
				href={effectiveData.storefront_url}
				target="_blank"
				rel="noopener noreferrer"
				class="text-sm text-blue-600 hover:underline dark:text-blue-400"
			>
				Visit Store
			</a>
		</div>
		<button
			onclick={handleDelete}
			class="flex-shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900 dark:hover:text-red-400"
			title="Delete store"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
			</svg>
		</button>
	</div>

	<div class="mt-4 space-y-2 text-sm">
		<div class="flex items-start justify-between gap-2">
			<span class="flex-shrink-0 text-gray-500 dark:text-gray-400">Ships from:</span>
			<div class="flex flex-wrap justify-end gap-1">
				{#each getCountries(effectiveData.ships_from) as country}
					<span class="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200">
						{country}
					</span>
				{/each}
			</div>
		</div>
		<div class="flex items-start justify-between gap-2">
			<span class="flex-shrink-0 text-gray-500 dark:text-gray-400">Ships to:</span>
			<div class="flex flex-wrap justify-end gap-1">
				{#each getCountries(effectiveData.ships_to) as country}
					<span class="rounded bg-green-100 px-1.5 py-0.5 font-mono text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200">
						{country}
					</span>
				{/each}
			</div>
		</div>
	</div>
</div>
