<script lang="ts">
	/**
	 * Review feedback about this entity, while its pull request is loaded for revision
	 * (stores/revision.ts). Shows each item with the field it is about, and marks the ones
	 * whose field the contributor has changed since loading, so working through the list is
	 * a matter of reading down it.
	 */
	import {
		revisionStore,
		feedbackForEntity,
		changedSinceLoaded,
		conflictsForEntity,
		isConflictOpen,
		pendingData,
		pendingOriginal
	} from '$lib/stores/revision';
	import { changeStore } from '$lib/stores/changes';
	import FeedbackItemView from '$lib/components/feedback/FeedbackItemView.svelte';

	interface Props {
		/** The entity's change-tracking path. */
		entityPath: string | null | undefined;
		/** The entity as the page shows it (pending changes applied). */
		data: unknown;
	}

	let { entityPath, data }: Props = $props();

	let items = $derived(entityPath ? feedbackForEntity($revisionStore, entityPath) : []);
	let changed = $derived(
		new Set(
			items
				.filter((item) => $revisionStore && changedSinceLoaded($revisionStore, item, data))
				.map((i) => i.id)
		)
	);
	let done = $derived(new Set($revisionStore?.done ?? []));
	let open = $derived(items.filter((i) => !changed.has(i.id) && !done.has(i.id)).length);
	/** Fields of this entry someone else changed on main since the submission, undecided. */
	let conflicts = $derived.by(() => {
		void $changeStore;
		if (!$revisionStore || !entityPath) return 0;
		return conflictsForEntity($revisionStore, entityPath).filter((c) =>
			isConflictOpen($revisionStore!, c, pendingData(entityPath), pendingOriginal(entityPath))
		).length;
	});
</script>

{#if $revisionStore && conflicts > 0}
	<div
		class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground"
	>
		<span>
			⚠ Someone else changed {conflicts} field{conflicts === 1 ? '' : 's'} of this entry after you
			submitted. Sending yours would replace their change.
		</span>
		<a href="/submissions/{$revisionStore.prNumber}" class="text-xs font-medium text-primary hover:underline">
			Check {conflicts === 1 ? 'it' : 'them'}
		</a>
	</div>
{/if}

{#if $revisionStore && items.length > 0}
	<section
		class="mb-6 rounded-lg border border-warning-border bg-card p-4"
		aria-label="Review feedback"
	>
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-sm font-semibold">
				Review feedback on this {items[0].location?.entityType ?? 'entry'}
				<span class="font-normal text-muted-foreground">
					· {open > 0 ? `${open} of ${items.length} to address` : '✓ all addressed'}
				</span>
			</h2>
			<a href="/submissions/{$revisionStore.prNumber}" class="text-xs text-primary hover:underline">
				All feedback
			</a>
		</div>
		<ul class="space-y-3">
			{#each items as item (item.id)}
				<li>
					<FeedbackItemView
						{item}
						changed={changed.has(item.id)}
						markedDone={done.has(item.id)}
						earlier={($revisionStore?.handledEarlier ?? []).includes(item.id)}
						onToggleDone={() => revisionStore.setDone(item.id, !done.has(item.id))}
					/>
				</li>
			{/each}
		</ul>
	</section>
{/if}
