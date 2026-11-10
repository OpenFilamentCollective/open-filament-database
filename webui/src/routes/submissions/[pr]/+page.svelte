<script lang="ts">
	/**
	 * A submission's review feedback, for its contributor. Linked from the "returned" email,
	 * the sticky PR comment and the Changes menu. "Fix in the editor" loads the PR's changes
	 * (stores/revision.ts); they are then editable right here, one card per entry with the
	 * feedback pinned to its fields.
	 */
	import { onMount } from 'svelte';
	import { Button, LoadingSpinner } from '$lib/components/ui';
	import FeedbackItemView from '$lib/components/feedback/FeedbackItemView.svelte';
	import ChangeCard from '$lib/components/feedback/ChangeCard.svelte';
	import FixFlow from '$lib/components/feedback/FixFlow.svelte';
	import { requestSubmit } from '$lib/stores/submitRequest';
	import { authStore } from '$lib/stores/auth';
	import { changeCount, changeStore, changesList } from '$lib/stores/changes';
	import { revisionStore, generalFeedback, isAddressed, pendingData } from '$lib/stores/revision';
	import type { FeedbackItem, SubmissionFeedbackResponse } from '$lib/types/feedback';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let info = $state<SubmissionFeedbackResponse | null>(null);
	let loadError = $state<string | null>(null);
	let loading = $state(true);
	let opening = $state(false);
	let openError = $state<string | null>(null);
	let confirmDiscard = $state(false);

	async function fetchInfo() {
		loading = true;
		loadError = null;
		try {
			const res = await fetch(`/api/submissions/${data.prNumber}`);
			const body = await res.json().catch(() => ({}));
			if (!res.ok) loadError = body.error || `Failed to load #${data.prNumber}`;
			else info = body as SubmissionFeedbackResponse;
		} catch {
			loadError = 'Could not reach the server.';
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		await fetchInfo();
		// Something to fix and allowed to fix it: go straight to editing. Only stop here when
		// loading would replace unsaved work (the confirm below) or there is nothing to do.
		if (
			info &&
			info.access.allowed &&
			(info.status === 'returned' || info.status === 'feedback') &&
			!alreadyLoaded &&
			!otherPending
		) {
			await openInEditor({ scroll: false });
		}
	});

	/** Items grouped by the entity they are about; general ones first. */
	let groups = $derived.by(() => {
		const out = new Map<string, FeedbackItem[]>();
		for (const item of info?.items ?? []) {
			const key = item.location?.entityPath ?? '';
			if (!out.has(key)) out.set(key, []);
			out.get(key)!.push(item);
		}
		return [...out.entries()].sort(([a], [b]) =>
			a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)
		);
	});

	let alreadyLoaded = $derived($revisionStore?.prNumber === data.prNumber);
	let otherPending = $derived(!alreadyLoaded && $changeCount > 0);

	const STATUS_TEXT: Record<SubmissionFeedbackResponse['status'], string> = {
		open: 'Awaiting review',
		feedback: 'Feedback to address',
		returned: 'Returned for changes',
		rejected: 'Not accepted',
		merged: 'Merged',
		closed: 'Closed'
	};

	/** How far through the feedback the contributor is, once the PR is loaded. */
	let progress = $derived.by(() => {
		void $changeStore; // isAddressed reads the pending data; re-run when it changes
		const revision = $revisionStore;
		if (!revision || revision.prNumber !== data.prNumber) return null;
		const addressed = revision.feedback.filter((item) =>
			isAddressed(
				revision,
				item,
				item.location?.entityPath ? pendingData(item.location.entityPath) : null
			)
		).length;
		return { total: revision.feedback.length, addressed };
	});

	let general = $derived(alreadyLoaded ? generalFeedback($revisionStore) : []);

	/** The loaded entries, parents first. */
	let cards = $derived(
		alreadyLoaded
			? [...$changesList].sort(
					(a, b) =>
						a.entity.path.split('/').length - b.entity.path.split('/').length ||
						a.entity.path.localeCompare(b.entity.path)
				)
			: []
	);

	async function openInEditor({ scroll = true }: { scroll?: boolean } = {}) {
		if (otherPending && !confirmDiscard) {
			confirmDiscard = true;
			return;
		}
		opening = true;
		openError = null;
		const result = await revisionStore.load(data.prNumber);
		opening = false;
		confirmDiscard = false;
		if (!result.ok) {
			openError = result.error;
			return;
		}
		// Stay: the changes are editable on this page now.
		if (scroll) {
			document
				.getElementById('your-changes')
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	function signIn(kind: 'github' | 'simplyprint') {
		const here = `/submissions/${data.prNumber}`;
		if (kind === 'github') authStore.ghLogin(here);
		else authStore.spLogin(here);
	}

	function entityTitle(path: string): string {
		const parts = path.split('/');
		const name = parts.at(-1)?.replace(/_/g, ' ') ?? path;
		const type =
			parts.length === 2
				? parts[0] === 'stores'
					? 'Store'
					: 'Brand'
				: parts.at(-2)?.replace(/s$/, '');
		return `${type ? type.charAt(0).toUpperCase() + type.slice(1) : ''} ${name}`.trim();
	}
</script>

<svelte:head>
	<title>Your contribution · Open Filament Database</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8">
	{#if loading}
		<div class="flex items-center gap-2 text-muted-foreground">
			<LoadingSpinner /> Loading your contribution…
		</div>
	{:else if loadError}
		<div class="rounded-md bg-destructive/10 p-4 text-sm text-destructive">{loadError}</div>
	{:else if info}
		<header class="mb-6">
			<div class="flex items-start justify-between gap-4">
				<h1 class="mb-3 text-2xl font-bold">{info.pr.title}</h1>
				<a
					href={info.pr.url}
					target="_blank"
					rel="noopener noreferrer"
					title="See this contribution on GitHub"
					aria-label="See this contribution on GitHub"
					class="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						viewBox="0 0 16 16"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
						/>
					</svg>
					GitHub
				</a>
			</div>
			<span
				class="inline-block rounded-full px-3 py-1 text-xs font-medium {info.status === 'merged'
					? 'bg-green-500/15 text-green-700 dark:text-green-400'
					: info.status === 'feedback' || info.status === 'returned'
						? 'bg-warning-surface text-warning-foreground'
						: info.status === 'rejected' || info.status === 'closed'
							? 'bg-muted text-muted-foreground'
							: 'bg-primary/10 text-primary'}"
			>
				{STATUS_TEXT[info.status]}
			</span>
		</header>

		{#if info.outcome?.supersededBy}
			<p class="mb-8 rounded-lg border p-4 text-sm">
				You sent a fixed version:
				<a href="/submissions/{info.outcome.supersededBy}" class="text-primary hover:underline"
					>see it here</a
				>.
			</p>
		{:else if info.status === 'merged'}
			<p class="mb-8 rounded-lg border p-4 text-sm">
				Accepted. It goes live with the next nightly update. Thank you!
			</p>
		{:else if info.status === 'rejected'}
			<div class="mb-8 rounded-lg border p-4 text-sm">
				<p>A reviewer decided not to add this contribution.</p>
				{#if info.outcome?.reason}
					<blockquote class="mt-2 border-l-2 pl-3 text-muted-foreground">
						{info.outcome.reason}
					</blockquote>
				{/if}
			</div>
		{:else if info.status === 'closed'}
			<p class="mb-8 rounded-lg border p-4 text-sm">
				This contribution was closed without being added.
			</p>
		{:else if info.status === 'open'}
			<p class="mb-8 rounded-lg border p-4 text-sm">
				Waiting for a reviewer. There is no feedback yet.
			</p>
		{:else}
			<!-- Returned, or open with feedback: what happened and what to do. -->
			<section class="mb-8 rounded-lg border bg-card p-5 shadow-sm">
				<h2 class="mb-2 text-lg font-semibold">A few things need fixing</h2>
				<p class="mb-3 text-sm">
					A reviewer found {info.items.length === 1 ? 'something' : 'some things'} to change in your contribution.
					{alreadyLoaded
						? 'Each one is shown next to the field it is about.'
						: 'Open it in the editor to fix them.'}
				</p>
				<ul class="mb-5 space-y-1 text-sm text-muted-foreground">
					<li><strong class="text-foreground">Change the field</strong> to fix it.</li>
					<li>
						<strong class="text-foreground">Mark done</strong> if it is already right, or fixed somewhere
						else.
					</li>
					<li>
						<strong class="text-foreground">💬 Comment</strong> to tell the reviewer why a value is like
						it is.
					</li>
					<li>
						When you're done, press <strong class="text-foreground">Send fixes</strong>.
					</li>
				</ul>

				<FixFlow current={progress && progress.addressed === progress.total ? 'send' : 'fix'} />

				<div class="mt-5 border-t pt-4">
					{#if alreadyLoaded && progress}
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="text-sm">
								<strong>{progress.addressed} of {progress.total}</strong> fixed.
								{#if progress.addressed === progress.total}
									<span class="font-medium text-green-700 dark:text-green-300">All done.</span>
								{/if}
							</p>
							<Button
								onclick={requestSubmit}
								variant={progress.addressed === progress.total ? 'primary' : 'outline'}
								size="md"
							>
								Send fixes
							</Button>
						</div>
					{:else if info.access.allowed}
						{#if confirmDiscard}
							<div
								class="mb-3 rounded-md border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground"
							>
								This replaces the {$changeCount} unsaved change{$changeCount === 1 ? '' : 's'} you have
								in the editor.
							</div>
						{/if}
						<div class="flex flex-wrap items-center gap-3">
							<Button
								onclick={() => openInEditor()}
								variant={confirmDiscard ? 'destructive' : 'primary'}
								size="md"
								disabled={opening}
							>
								{#if opening}
									<LoadingSpinner /> Loading…
								{:else if confirmDiscard}
									Replace them and continue
								{:else}
									Fix in the editor
								{/if}
							</Button>
							{#if confirmDiscard}
								<Button onclick={() => (confirmDiscard = false)} variant="ghost" size="md"
									>Cancel</Button
								>
							{/if}
						</div>
						{#if openError}
							<p class="mt-3 text-sm text-destructive">{openError}</p>
						{/if}
					{:else if info.access.signIn}
						<p class="mb-3 text-sm text-muted-foreground">{info.access.reason}</p>
						<Button onclick={() => signIn(info!.access.signIn!)} variant="primary" size="md">
							Sign in with {info.access.signIn === 'github' ? 'GitHub' : 'SimplyPrint'}
						</Button>
						{#if info.access.signIn === 'simplyprint'}
							<button
								onclick={() => signIn('github')}
								class="ml-3 cursor-pointer text-xs text-muted-foreground hover:underline"
							>
								Maintainer? Sign in with GitHub
							</button>
						{/if}
					{:else if info.access.reason}
						<p class="text-sm text-muted-foreground">{info.access.reason}</p>
					{/if}
				</div>
			</section>
		{/if}

		{#if alreadyLoaded}
			{#if general.length > 0}
				<h2 class="mb-3 text-lg font-semibold">General feedback</h2>
				<ul class="mb-8 space-y-2">
					{#each general as item (item.id)}
						<li>
							<FeedbackItemView
								{item}
								markedDone={($revisionStore?.done ?? []).includes(item.id)}
								onToggleDone={() =>
									revisionStore.setDone(item.id, !($revisionStore?.done ?? []).includes(item.id))}
							/>
						</li>
					{/each}
				</ul>
			{/if}
			<h2 id="your-changes" class="mb-1 scroll-mt-4 text-lg font-semibold">Your changes</h2>
			<p class="mb-4 text-sm text-muted-foreground">
				Your edits are kept in the editor until you submit them.
			</p>
			<div class="space-y-4">
				{#each cards as change (change.entity.path)}
					<ChangeCard {change} />
				{/each}
			</div>
		{:else if info.items.length > 0}
			<h2 class="mb-3 text-lg font-semibold">Feedback</h2>
			<div class="space-y-6">
				{#each groups as [entityPath, items] (entityPath)}
					<section>
						<h3 class="mb-2 text-sm font-semibold text-muted-foreground">
							{#if entityPath}
								{entityTitle(entityPath)}
							{:else}
								General
							{/if}
						</h3>
						<ul class="space-y-2">
							{#each items as item (item.id)}
								<li><FeedbackItemView {item} /></li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
			{#if info.truncated}
				<p class="mt-4 text-xs text-muted-foreground">
					There is a lot of discussion on this contribution; only the first 100 comments of each
					kind are shown.
				</p>
			{/if}
		{/if}
	{/if}
</div>
