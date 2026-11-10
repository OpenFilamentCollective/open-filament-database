<script lang="ts">
	/**
	 * The contributor's submissions from this browser (stores/submitted.ts), newest first, with
	 * the ones that need changes from them flagged. Each links to /submissions/[pr].
	 */
	import { onMount } from 'svelte';
	import { submittedStore, submissionEntries, needsChanges } from '$lib/stores/submitted';
	import type { SubmittedEntry } from '$lib/types/changes';

	onMount(() => {
		submittedStore.reconcile();
	});

	const STATUS: Record<string, { label: string; class: string }> = {
		open: { label: 'Awaiting review', class: 'bg-primary/10 text-primary' },
		changes_requested: {
			label: 'Changes requested',
			class: 'bg-warning-surface text-warning-foreground'
		},
		returned: {
			label: 'Returned for changes',
			class: 'bg-warning-surface text-warning-foreground'
		},
		merged: { label: 'Merged', class: 'bg-green-500/15 text-green-700 dark:text-green-400' }
	};

	function status(entry: SubmittedEntry) {
		return STATUS[entry.status ?? 'open'] ?? STATUS.open;
	}

	function summary(entry: SubmittedEntry): string {
		const descriptions = entry.changes.map((c) => c.description).filter(Boolean) as string[];
		const shown = descriptions.slice(0, 3).join(', ');
		return descriptions.length > 3 ? `${shown} and ${descriptions.length - 3} more` : shown;
	}

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	let attention = $derived($submissionEntries.filter(needsChanges).length);
</script>

<svelte:head>
	<title>Your submissions · Open Filament Database</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold">Your submissions</h1>
	<p class="mb-6 text-sm text-muted-foreground">
		Submissions made from this browser.
		{#if attention > 0}
			<span class="font-medium text-warning-foreground">
				{attention} need{attention === 1 ? 's' : ''} changes from you.
			</span>
		{/if}
	</p>

	{#if $submissionEntries.length === 0}
		<p class="text-sm text-muted-foreground">
			You haven't submitted anything from this browser yet. Submissions you make from the Changes
			menu show up here.
		</p>
	{:else}
		<ul class="divide-y rounded-lg border">
			{#each $submissionEntries as entry (entry.uuid)}
				{@const s = status(entry)}
				<li>
					<a
						href="/submissions/{entry.prNumber}"
						class="flex items-start gap-3 p-4 transition-colors hover:bg-muted/50"
					>
						<span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
							{#if needsChanges(entry)}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-5 w-5 text-warning"
									aria-label="Needs changes"
									role="img"
								>
									<path
										fill-rule="evenodd"
										d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
										clip-rule="evenodd"
									/>
								</svg>
							{:else}
								<span class="h-2 w-2 rounded-full bg-muted-foreground/40"></span>
							{/if}
						</span>
						<span class="min-w-0 flex-1">
							<span class="flex flex-wrap items-center gap-2">
								<span class="text-sm font-semibold">#{entry.prNumber}</span>
								<span class="rounded-full px-2 py-0.5 text-xs font-medium {s.class}">{s.label}</span
								>
								<span class="text-xs text-muted-foreground"
									>submitted {when(entry.submittedAt)}</span
								>
							</span>
							<span class="mt-1 block truncate text-sm text-muted-foreground">
								{summary(entry) ||
									`${entry.changes.length} change${entry.changes.length === 1 ? '' : 's'}`}
							</span>
							{#if needsChanges(entry)}
								<span class="mt-1 block text-xs font-medium text-warning-foreground">
									A reviewer sent feedback. Open it to fix it in the editor →
								</span>
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
