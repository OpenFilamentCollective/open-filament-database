<script lang="ts">
	import { getChangeCount, getChanges, clearChanges, exportChanges } from '$lib/stores/changes.svelte';

	let showDropdown = $state(false);

	function handleExport() {
		const json = exportChanges();
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `filament-db-changes-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
		showDropdown = false;
	}

	function handleClear() {
		if (confirm('Are you sure you want to clear all pending changes?')) {
			clearChanges();
			showDropdown = false;
		}
	}
</script>

{#if getChangeCount() > 0}
	<div class="relative">
		<button
			onclick={() => (showDropdown = !showDropdown)}
			class="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
				/>
			</svg>
			{getChangeCount()} pending change{getChangeCount() !== 1 ? 's' : ''}
		</button>

		{#if showDropdown}
			<div
				class="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
			>
				<div class="max-h-64 overflow-y-auto p-2">
					{#each getChanges() as change}
						<div class="rounded-md p-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700">
							<span
								class="inline-block rounded px-1 py-0.5 font-medium {change.operation === 'create'
									? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
									: change.operation === 'update'
										? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
										: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}"
							>
								{change.operation}
							</span>
							<p class="mt-1 truncate text-gray-600 dark:text-gray-400">{change.path}</p>
						</div>
					{/each}
				</div>
				<div class="flex gap-2 border-t border-gray-200 p-2 dark:border-gray-700">
					<button
						onclick={handleExport}
						class="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
					>
						Export JSON
					</button>
					<button
						onclick={handleClear}
						class="flex-1 rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
					>
						Clear All
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
