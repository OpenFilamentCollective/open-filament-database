<script lang="ts">
	/**
	 * One entity of the submission under revision, editable in place: its data as nested
	 * blocks (ValueEditor), the differences from main marked, and each feedback item pinned
	 * to the field it is about. Edits go straight into the pending change set.
	 */
	import { changeStore } from '$lib/stores/changes';
	import {
		revisionStore,
		feedbackForEntity,
		changedSinceLoaded,
		conflictsForEntity,
		isConflictOpen
	} from '$lib/stores/revision';
	import { updateAtPointer, valueAtPointer } from '$lib/utils/jsonPointer';
	import type { EntityChange } from '$lib/types/changes';
	import type { FeedbackItem } from '$lib/types/feedback';
	import ValueEditor from './ValueEditor.svelte';
	import FeedbackItemView from './FeedbackItemView.svelte';

	interface Props {
		change: EntityChange;
	}

	let { change }: Props = $props();

	let items = $derived(feedbackForEntity($revisionStore, change.entity.path));
	let data = $derived(change.data);
	let isUpdate = $derived(change.operation === 'update');

	/** Pointers that exist in the data (or the original), so their items can be pinned there. */
	function resolves(pointer: string): boolean {
		return (
			valueAtPointer(data, pointer) !== undefined ||
			(isUpdate && valueAtPointer(change.originalData, pointer) !== undefined)
		);
	}
	let pinned = $derived(items.filter((i) => i.location?.pointer && resolves(i.location.pointer)));
	let unpinned = $derived(items.filter((i) => !pinned.includes(i)));
	let open = $derived(
		$revisionStore
			? items.filter(
					(i) =>
						!changedSinceLoaded($revisionStore!, i, data) &&
						!($revisionStore!.done ?? []).includes(i.id)
				).length
			: 0
	);

	/** Rebase conflicts in this entry that still need a decision (see stores/revision.ts). */
	let conflicts = $derived(
		$revisionStore
			? conflictsForEntity($revisionStore, change.entity.path).filter((c) =>
					isConflictOpen($revisionStore!, c, data, change.originalData)
				)
			: []
	);
	let entityConflict = $derived(conflicts.find((c) => c.pointer === ''));
	function conflictAt(pointer: string): boolean {
		return pointer !== '' && conflicts.some((c) => c.pointer === pointer);
	}
	function keep(pointer: string) {
		const conflict = conflicts.find((c) => c.pointer === pointer);
		if (conflict) revisionStore.setConflictKept(conflict, true);
	}

	function feedbackAt(pointer: string): FeedbackItem[] {
		return pinned.filter((i) => i.location!.pointer === pointer);
	}

	function apply(pointer: string, value: unknown, remove = false) {
		const next = updateAtPointer(data, pointer, value, remove);
		if (change.operation === 'create') changeStore.trackCreate(change.entity, next);
		else if (change.operation === 'update')
			changeStore.trackUpdate(change.entity, change.originalData, next);
	}

	let name = $derived(
		(data as any)?.name || (data as any)?.material || change.entity.id.replace(/_/g, ' ')
	);
	const OP_LABEL = { create: 'New', update: 'Changed', delete: 'Deleted' } as const;
</script>

{#snippet pinnedFeedback(list: FeedbackItem[])}
	{#each list as item (item.id)}
		<FeedbackItemView
			{item}
			compact
			changed={$revisionStore ? changedSinceLoaded($revisionStore, item, data) : false}
			markedDone={($revisionStore?.done ?? []).includes(item.id)}
				earlier={($revisionStore?.handledEarlier ?? []).includes(item.id)}
			onToggleDone={() =>
				revisionStore.setDone(item.id, !($revisionStore?.done ?? []).includes(item.id))}
		/>
	{/each}
{/snippet}

<section class="rounded-lg border bg-card" id="change-{change.entity.path.replace(/\W+/g, '-')}">
	<header class="flex flex-wrap items-center gap-2 border-b px-4 py-3">
		<span class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
			>{change.entity.type}</span
		>
		<h3 class="font-semibold">{name}</h3>
		<span
			class="rounded-full px-2 py-0.5 text-xs font-medium {change.operation === 'create'
				? 'bg-green-500/15 text-green-700 dark:text-green-300'
				: change.operation === 'delete'
					? 'bg-destructive/10 text-destructive'
					: 'bg-primary/10 text-primary'}"
		>
			{OP_LABEL[change.operation]}
		</span>
		{#if items.length > 0}
			<span
				class="rounded-full px-2 py-0.5 text-xs font-medium {open > 0
					? 'border border-warning-border bg-warning-surface text-warning-foreground'
					: 'bg-green-500/15 text-green-700 dark:text-green-300'}"
			>
				{open > 0 ? `${open} to address` : '✓ all addressed'}
			</span>
		{/if}
		{#if conflicts.length > 0}
			<span
				class="rounded-full border border-warning-border bg-warning-surface px-2 py-0.5 text-xs font-medium text-warning-foreground"
				title="Someone else changed these on the live database after you submitted"
			>
				⚠ {conflicts.length} changed by someone else
			</span>
		{/if}
	</header>

	<div class="space-y-3 p-4">
		{#if unpinned.length > 0}
			<div
				class="overflow-hidden rounded-md border border-warning-border [&>article:first-child]:border-t-0"
			>
				{@render pinnedFeedback(unpinned)}
			</div>
		{/if}

		{#if entityConflict}
			<div
				class="rounded-md border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground"
			>
				<p>
					This entry was removed from the live database after you submitted. Sending your version
					adds it back.
				</p>
				<div class="mt-2 flex gap-3 text-xs">
					<button
						type="button"
						class="cursor-pointer font-medium text-primary hover:underline"
						onclick={() => changeStore.removeChange(change.entity.path)}
					>
						Leave it removed
					</button>
					<button
						type="button"
						class="cursor-pointer text-primary hover:underline"
						onclick={() => revisionStore.setConflictKept(entityConflict!, true)}
					>
						Keep mine
					</button>
				</div>
			</div>
		{/if}

		{#if change.operation === 'delete'}
			<p class="text-sm text-muted-foreground">This entry is deleted by the submission.</p>
			<button
				type="button"
				class="cursor-pointer text-sm text-primary hover:underline"
				onclick={() => changeStore.removeChange(change.entity.path)}
			>
				Keep it instead
			</button>
		{:else}
			<ValueEditor
				value={data}
				original={change.originalData}
				compare={isUpdate}
				{feedbackAt}
				renderFeedback={pinnedFeedback}
				onchange={apply}
				noteAt={(p) => $revisionStore?.notes?.[change.entity.path]?.[p]}
				onnote={(p, text) => revisionStore.setNote(change.entity.path, p, text)}
				{conflictAt}
				onkeep={keep}
			/>
		{/if}
	</div>
</section>
