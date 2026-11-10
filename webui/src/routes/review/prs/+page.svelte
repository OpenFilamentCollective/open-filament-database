<script lang="ts">
	/**
	 * Maintainer PR picker: pick an open (or recently returned) pull request and load it into
	 * the editor to fix it there. Pushing happens from the Changes menu; see stores/revision.ts.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button, LoadingSpinner } from '$lib/components/ui';
	import { authStore } from '$lib/stores/auth';
	import { changeCount } from '$lib/stores/changes';
	import { revisionStore } from '$lib/stores/revision';
	import type { PickerRow } from '$lib/types/feedback';

	let rows = $state<PickerRow[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let needsSignIn = $state(false);
	let filter = $state<'web' | 'all'>('web');
	let query = $state('');
	let loadingPr = $state<number | null>(null);
	let confirmPr = $state<number | null>(null);
	let loadError = $state<{ pr: number; message: string } | null>(null);

	onMount(async () => {
		try {
			const res = await fetch('/api/review/prs');
			const body = await res.json().catch(() => ({}));
			if (res.status === 401) needsSignIn = true;
			else if (!res.ok) error = body.error || 'Failed to list pull requests';
			else rows = body.rows;
		} catch {
			error = 'Could not reach the server.';
		} finally {
			loading = false;
		}
	});

	let shown = $derived(
		rows.filter((r) => {
			if (filter === 'web' && r.kind === 'other') return false;
			const q = query.trim().toLowerCase();
			return !q || `#${r.number} ${r.title} ${r.author}`.toLowerCase().includes(q);
		})
	);

	async function load(row: PickerRow) {
		const replacing = $changeCount > 0 && $revisionStore?.prNumber !== row.number;
		if (replacing && confirmPr !== row.number) {
			confirmPr = row.number;
			return;
		}
		confirmPr = null;
		loadError = null;
		loadingPr = row.number;
		const result = await revisionStore.load(row.number);
		loadingPr = null;
		if (!result.ok) {
			loadError = { pr: row.number, message: result.error };
			return;
		}
		goto(`/submissions/${row.number}`);
	}

	const KIND_LABEL: Record<PickerRow['kind'], string> = {
		bot: 'SimplyPrint',
		fork: 'Web editor',
		other: 'Manual'
	};

	function ago(iso: string): string {
		const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
		if (hours < 1) return 'just now';
		if (hours < 24) return `${Math.floor(hours)}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	}
</script>

<svelte:head>
	<title>Load a pull request · Open Filament Database</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold">Load a pull request</h1>
	<p class="mb-6 text-sm text-muted-foreground">
		Open pull requests, plus ones returned for changes in the last 30 days. Loading one puts its
		changes and feedback into the editor; submitting from the Changes menu pushes your fix onto it.
	</p>

	{#if loading}
		<div class="flex items-center gap-2 text-muted-foreground">
			<LoadingSpinner /> Loading pull requests…
		</div>
	{:else if needsSignIn}
		<p class="mb-3 text-sm">Sign in with GitHub. This page is for maintainers with write access.</p>
		<Button onclick={() => authStore.ghLogin('/review/prs')} variant="primary" size="md"
			>Sign in with GitHub</Button
		>
	{:else if error}
		<div class="rounded-md bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
	{:else}
		<div class="mb-4 flex flex-wrap items-center gap-3">
			<input
				type="search"
				bind:value={query}
				placeholder="Filter by number, title or author"
				class="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
			/>
			<label class="flex items-center gap-1.5 text-sm">
				<input type="radio" bind:group={filter} value="web" /> Web editor only
			</label>
			<label class="flex items-center gap-1.5 text-sm">
				<input type="radio" bind:group={filter} value="all" /> All
			</label>
		</div>

		{#if shown.length === 0}
			<p class="text-sm text-muted-foreground">No pull requests match.</p>
		{:else}
			<ul class="divide-y rounded-lg border">
				{#each shown as row (row.number)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">
								<a
									href={row.url}
									target="_blank"
									rel="noopener noreferrer"
									class="text-primary hover:underline">#{row.number}</a
								>
								{row.title}
							</p>
							<p class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
								<span>{KIND_LABEL[row.kind]}</span>
								<span>· {row.author}</span>
								<span>· updated {ago(row.updatedAt)}</span>
								{#if row.state === 'returned'}<span class="text-warning-foreground">· returned</span
									>{/if}
								{#if row.feedbackCount}
									<a href="/submissions/{row.number}" class="text-primary hover:underline"
										>· {row.feedbackCount} feedback</a
									>
								{/if}
							</p>
							{#if loadError?.pr === row.number}
								<p class="mt-1 text-xs text-destructive">{loadError.message}</p>
							{/if}
							{#if confirmPr === row.number}
								<p class="mt-1 text-xs text-warning-foreground">
									Loading replaces your {$changeCount} unsubmitted change{$changeCount === 1
										? ''
										: 's'}.
								</p>
							{/if}
						</div>
						{#if row.pushable}
							<Button
								onclick={() => load(row)}
								variant={confirmPr === row.number ? 'destructive' : 'outline'}
								size="sm"
								disabled={loadingPr !== null}
							>
								{#if loadingPr === row.number}
									<LoadingSpinner /> Loading…
								{:else if $revisionStore?.prNumber === row.number}
									Reload
								{:else if confirmPr === row.number}
									Discard and load
								{:else}
									Load into editor
								{/if}
							</Button>
						{:else}
							<span class="max-w-56 text-right text-xs text-muted-foreground">{row.pushReason}</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
