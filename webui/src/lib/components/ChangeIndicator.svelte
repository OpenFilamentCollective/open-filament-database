<script lang="ts">
	import { getChangeCount, getChanges, clearChanges, removeChange, exportChanges, formatChangeDescription } from '$lib/stores/changes.svelte';

	let showDropdown = $state(false);
	let copyStatus = $state<'idle' | 'copied'>('idle');

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

	async function handleCopy() {
		const json = exportChanges();
		try {
			await navigator.clipboard.writeText(json);
			copyStatus = 'copied';
			setTimeout(() => {
				copyStatus = 'idle';
			}, 2000);
		} catch {
			// Fallback for older browsers
			const textarea = document.createElement('textarea');
			textarea.value = json;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
			copyStatus = 'copied';
			setTimeout(() => {
				copyStatus = 'idle';
			}, 2000);
		}
	}

	function handleClear() {
		if (confirm('Are you sure you want to clear all pending changes?')) {
			clearChanges();
			showDropdown = false;
			window.location.reload();
		}
	}

	function handleRemove(id: string) {
		removeChange(id);
		// If no more changes, close dropdown and reload
		if (getChangeCount() === 0) {
			showDropdown = false;
			window.location.reload();
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
						<div class="flex items-start gap-2 rounded-md p-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700">
							<div class="flex-1 min-w-0">
								<span
									class="inline-block rounded px-1 py-0.5 font-medium {change.operation === 'create'
										? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
										: change.operation === 'update'
											? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
											: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}"
								>
									{change.operation}
								</span>
								<p class="mt-1 truncate text-gray-600 dark:text-gray-400">{formatChangeDescription(change)}</p>
							</div>
							<button
								onclick={() => handleRemove(change.id)}
								class="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900 dark:hover:text-red-400"
								title="Remove this change"
							>
								<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
				<div class="flex flex-col gap-2 border-t border-gray-200 p-2 dark:border-gray-700">
					<div class="flex gap-2">
						<button
							onclick={handleCopy}
							class="flex-1 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
						>
							{copyStatus === 'copied' ? 'Copied!' : 'Copy JSON'}
						</button>
						<button
							onclick={handleExport}
							class="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
						>
							Download
						</button>
					</div>
					<button
						onclick={handleClear}
						class="w-full rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
					>
						Clear All
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
