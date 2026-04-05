<script lang="ts">
	import Modal from './Modal.svelte';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import { apiFetch } from '$lib/utils/api';

	interface Props {
		show: boolean;
		onClose: () => void;
		title?: string;
		currentData: Record<string, any> | null;
		apiPath: string;
	}

	let { show, onClose, title = 'Compare with Cloud', currentData, apiPath }: Props = $props();

	let cloudData: Record<string, any> | null = $state(null);
	let loading = $state(false);
	let error: string | null = $state(null);

	// Fetch cloud data when modal opens
	$effect(() => {
		if (show && apiPath) {
			loading = true;
			error = null;
			cloudData = null;

			apiFetch(apiPath)
				.then(async (res) => {
					if (res.ok) {
						cloudData = await res.json();
					} else {
						error = `Failed to fetch: ${res.statusText}`;
					}
				})
				.catch((e) => {
					error = e instanceof Error ? e.message : 'Failed to fetch cloud data';
				})
				.finally(() => {
					loading = false;
				});
		}
	});

	// Fields that differ between cloud and local
	const diffInfo = $derived.by(() => {
		if (!cloudData || !currentData) return { added: [], removed: [], changed: [], unchanged: [] };

		const allKeys = new Set([...Object.keys(cloudData), ...Object.keys(currentData)]);
		const added: string[] = [];
		const removed: string[] = [];
		const changed: string[] = [];
		const unchanged: string[] = [];

		for (const key of allKeys) {
			const inCloud = key in cloudData;
			const inLocal = key in currentData;

			if (!inCloud && inLocal) {
				added.push(key);
			} else if (inCloud && !inLocal) {
				removed.push(key);
			} else if (JSON.stringify(cloudData[key]) !== JSON.stringify(currentData[key])) {
				changed.push(key);
			} else {
				unchanged.push(key);
			}
		}

		return { added, removed, changed, unchanged };
	});

	function formatValue(val: any): string {
		if (val === undefined) return '(undefined)';
		if (val === null) return 'null';
		if (typeof val === 'object') return JSON.stringify(val, null, 2);
		return String(val);
	}

	function getFieldClass(key: string): string {
		if (diffInfo.added.includes(key)) return 'bg-green-500/10 border-l-2 border-l-green-500';
		if (diffInfo.removed.includes(key)) return 'bg-red-500/10 border-l-2 border-l-red-500';
		if (diffInfo.changed.includes(key)) return 'bg-yellow-500/10 border-l-2 border-l-yellow-500';
		return '';
	}
</script>

<Modal {show} {title} {onClose} maxWidth="5xl" height="3/4">
	{#if loading}
		<div class="flex justify-center items-center py-12">
			<LoadingSpinner size="xl" class="text-primary" />
		</div>
	{:else if error}
		<div class="rounded-md bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
	{:else if cloudData && currentData}
		<div class="mb-4 flex gap-4 text-xs">
			<span class="flex items-center gap-1">
				<span class="inline-block w-3 h-3 rounded bg-yellow-500/30 border border-yellow-500"></span>
				Changed
			</span>
			<span class="flex items-center gap-1">
				<span class="inline-block w-3 h-3 rounded bg-green-500/30 border border-green-500"></span>
				Added locally
			</span>
			<span class="flex items-center gap-1">
				<span class="inline-block w-3 h-3 rounded bg-red-500/30 border border-red-500"></span>
				Removed locally
			</span>
		</div>

		{#if diffInfo.added.length === 0 && diffInfo.removed.length === 0 && diffInfo.changed.length === 0}
			<div class="rounded-md bg-green-500/10 p-4 text-sm text-green-700 dark:text-green-400">
				No differences found. Local data matches cloud data.
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-4 text-sm">
				<div class="font-semibold text-muted-foreground pb-2 border-b">Cloud (Original)</div>
				<div class="font-semibold text-muted-foreground pb-2 border-b">Local (Current)</div>

				{#each [...diffInfo.changed, ...diffInfo.added, ...diffInfo.removed, ...diffInfo.unchanged] as key}
					{@const fieldClass = getFieldClass(key)}
					<!-- Cloud side -->
					<div class="py-2 px-2 rounded {fieldClass}">
						<div class="font-medium text-xs text-muted-foreground mb-1">{key}</div>
						<pre class="whitespace-pre-wrap text-xs font-mono break-all">{key in (cloudData ?? {}) ? formatValue(cloudData?.[key]) : '(not present)'}</pre>
					</div>
					<!-- Local side -->
					<div class="py-2 px-2 rounded {fieldClass}">
						<div class="font-medium text-xs text-muted-foreground mb-1">{key}</div>
						<pre class="whitespace-pre-wrap text-xs font-mono break-all">{key in (currentData ?? {}) ? formatValue(currentData?.[key]) : '(not present)'}</pre>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="text-muted-foreground text-sm">No data available.</div>
	{/if}
</Modal>
