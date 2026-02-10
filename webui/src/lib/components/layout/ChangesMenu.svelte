<script lang="ts">
	import { changeStore, changeCount, hasChanges, changesList } from '$lib/stores/changes';
	import { isCloudMode } from '$lib/stores/environment';
	import type { EntityChange } from '$lib/types/changes';
	import type { Store } from '$lib/types/database';
	import { Button } from '$lib/components/ui';
	import { db } from '$lib/services/database';
	import { onMount } from 'svelte';

	let menuOpen = $state(false);
	let expandedChanges = $state<Set<string>>(new Set());
	let stores = $state<Store[]>([]);

	// Load stores on mount for resolving store_id to store names
	onMount(async () => {
		stores = await db.loadStores();
	});

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}

	function toggleExpanded(path: string) {
		const newSet = new Set(expandedChanges);
		if (newSet.has(path)) {
			newSet.delete(path);
		} else {
			newSet.add(path);
		}
		expandedChanges = newSet;
	}

	function formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	function getOperationBadge(operation: EntityChange['operation']): { bg: string; text: string; label: string } {
		switch (operation) {
			case 'create':
				return { bg: 'bg-green-500/10', text: 'text-green-700 dark:text-green-400', label: 'Created' };
			case 'update':
				return { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', label: 'Updated' };
			case 'delete':
				return { bg: 'bg-destructive/10', text: 'text-destructive', label: 'Deleted' };
			default:
				return { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Changed' };
		}
	}

	function entityPathToUrl(entityPath: string): string {
		const parts = entityPath.split('/');
		const urlParts = [parts[0]];
		for (let i = 1; i < parts.length; i += 2) {
			urlParts.push(parts[i]);
		}
		return '/' + urlParts.join('/');
	}

	function undoChange(change: EntityChange) {
		if (confirm('Are you sure you want to undo this change?')) {
			changeStore.removeChange(change.entity.path);

			const entityUrl = entityPathToUrl(change.entity.path);
			const currentPath = window.location.pathname;

			if (change.operation === 'delete' && currentPath === entityUrl) {
				// Undoing deletion of current entity — navigate up one level
				const parts = currentPath.split('/').filter(Boolean);
				parts.pop();
				window.location.href = '/' + parts.join('/');
			} else if (
				currentPath === entityUrl ||
				currentPath.startsWith(entityUrl + '/') ||
				entityUrl.startsWith(currentPath + '/')
			) {
				// Change is related to current page — reload to reflect updated data
				window.location.reload();
			}
		}
	}

	async function exportChanges() {
		const exportData = changeStore.exportChanges();
		const json = JSON.stringify(exportData, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = `ofd-changes-${Date.now()}.json`;
		a.click();

		URL.revokeObjectURL(url);
	}

	function clearAllChanges() {
		if (confirm('Are you sure you want to clear all pending changes? This cannot be undone.')) {
			changeStore.clear();
			closeMenu();
			window.location.reload();
		}
	}

	function getStoreName(storeId: string): string {
		const store = stores.find((s) => s.id === storeId);
		return store?.name || storeId;
	}

	function formatValue(value: any): string {
		if (value === null) return 'null';
		if (value === undefined) return 'undefined';
		if (typeof value === 'object') {
			// Enhance purchase_links to show store names instead of just IDs
			const enhanced = JSON.parse(JSON.stringify(value));
			enhancePurchaseLinks(enhanced);
			return JSON.stringify(enhanced, null, 2);
		}
		return String(value);
	}

	function enhancePurchaseLinks(obj: any): void {
		if (!obj || typeof obj !== 'object') return;

		if (Array.isArray(obj)) {
			for (const item of obj) {
				enhancePurchaseLinks(item);
			}
		} else {
			// Check if this is a purchase link object with store_id
			if ('store_id' in obj && typeof obj.store_id === 'string') {
				const storeName = getStoreName(obj.store_id);
				if (storeName !== obj.store_id) {
					obj.store = storeName;
				}
			}
			// Recurse into nested objects
			for (const key of Object.keys(obj)) {
				if (typeof obj[key] === 'object') {
					enhancePurchaseLinks(obj[key]);
				}
			}
		}
	}
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); }} />

{#if $isCloudMode}
	<div class="relative">
		<Button
			onclick={toggleMenu}
			variant="ghost"
			size="icon"
			title={$hasChanges ? `${$changeCount} pending changes` : 'No pending changes'}
			class={$hasChanges ? 'relative' : ''}
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
				<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
				<path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" />
			</svg>
			{#if $hasChanges}
				<span class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-medium text-white">
					{$changeCount}
				</span>
			{/if}
		</Button>

		{#if menuOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
			<div class="fixed inset-0 z-50" onclick={closeMenu} role="presentation" aria-hidden="true"></div>

			<div class="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover shadow-md">
				<!-- Header -->
				<div class="flex items-center justify-between border-b px-4 py-3">
					<div>
						<h3 class="font-semibold">Pending Changes</h3>
						{#if $hasChanges}
							<p class="text-xs text-muted-foreground">{$changeCount} unsaved {$changeCount === 1 ? 'change' : 'changes'}</p>
						{/if}
					</div>
					<Button onclick={closeMenu} variant="ghost" size="icon" class="h-8 w-8">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
						</svg>
					</Button>
				</div>

				<!-- Content -->
				<div class="max-h-96 overflow-y-auto">
					{#if $hasChanges}
						<div class="divide-y">
							{#each $changesList as change}
								{@const badge = getOperationBadge(change.operation)}
								{@const isExpanded = expandedChanges.has(change.entity.path)}
								<div class="p-3">
									<!-- Change header -->
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2">
												<span class="rounded px-1.5 py-0.5 text-xs font-medium {badge.bg} {badge.text}">
													{badge.label}
												</span>
												<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
													{change.entity.type}
												</span>
												<span class="text-xs text-muted-foreground">
													{formatTimestamp(change.timestamp)}
												</span>
											</div>
											<p class="mt-1 truncate text-sm font-medium">{change.description}</p>
											<p class="truncate text-xs text-muted-foreground">{change.entity.path}</p>
										</div>
										<Button
											onclick={() => undoChange(change)}
											variant="ghost"
											size="sm"
											class="h-7 shrink-0 text-xs hover:bg-destructive/10 hover:text-destructive"
										>
											Undo
										</Button>
									</div>

									<!-- Property changes -->
									{#if change.propertyChanges && change.propertyChanges.length > 0}
										<Button
											onclick={() => toggleExpanded(change.entity.path)}
											variant="ghost"
											size="sm"
											class="mt-2 h-auto w-full justify-start px-0 py-1 text-xs text-muted-foreground hover:text-foreground"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3 w-3 transition-transform {isExpanded ? 'rotate-90' : ''}"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
											</svg>
											{change.propertyChanges.length} {change.propertyChanges.length === 1 ? 'field' : 'fields'} changed
										</Button>

										{#if isExpanded}
											<div class="mt-2 space-y-2 rounded border bg-muted/50 p-2 text-xs">
												{#each change.propertyChanges as propChange}
													<div>
														<span class="font-medium">{propChange.property}</span>
														{#if propChange.oldValue === undefined}
															<span class="ml-1 text-green-600 dark:text-green-400">added</span>
															<pre class="mt-1 overflow-x-auto rounded bg-green-500/10 p-1.5 text-green-700 dark:text-green-400">{formatValue(propChange.newValue)}</pre>
														{:else if propChange.newValue === undefined}
															<span class="ml-1 text-destructive">removed</span>
															<pre class="mt-1 overflow-x-auto rounded bg-destructive/10 p-1.5 text-destructive line-through">{formatValue(propChange.oldValue)}</pre>
														{:else}
															<div class="mt-1 grid gap-1">
																<pre class="overflow-x-auto rounded bg-destructive/10 p-1.5 text-destructive line-through">{formatValue(propChange.oldValue)}</pre>
																<pre class="overflow-x-auto rounded bg-green-500/10 p-1.5 text-green-700 dark:text-green-400">{formatValue(propChange.newValue)}</pre>
															</div>
														{/if}
													</div>
												{/each}
											</div>
										{/if}
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<div class="flex flex-col items-center justify-center px-4 py-8 text-center">
							<svg xmlns="http://www.w3.org/2000/svg" class="mb-2 h-8 w-8 text-muted-foreground/50" viewBox="0 0 20 20" fill="currentColor">
								<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
								<path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
							</svg>
							<p class="font-medium text-muted-foreground">No pending changes</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Changes you make will appear here
							</p>
						</div>
					{/if}
				</div>

				<!-- Footer actions -->
				{#if $hasChanges}
					<div class="flex gap-2 border-t p-3">
						<Button onclick={exportChanges} variant="secondary" size="sm" class="flex-1">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
							</svg>
							Export JSON
						</Button>
						<Button onclick={clearAllChanges} variant="ghost" size="sm" class="hover:bg-destructive/10 hover:text-destructive">
							Clear All
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
