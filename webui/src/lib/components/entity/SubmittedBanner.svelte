<script lang="ts">
	/**
	 * "This entity is in an open submission" banner for entity detail pages.
	 *
	 * Replaces a bare "Submitted - awaiting merge" note with the PR it is waiting on. Knowing
	 * *which* review your change is sitting in is what stops the repeat submissions this
	 * whole mechanism exists to prevent — a contributor who can see PR #459 covers this
	 * filament has no reason to re-create it.
	 *
	 * A merged entry is also shown, because merging does not make the change visible: the
	 * upstream dataset is rebuilt once a night (see `$lib/config/datasetSchedule.ts`).
	 */
	import type { SubmittedEntry } from '$lib/types/changes';

	interface Props {
		entry: SubmittedEntry;
	}

	let { entry }: Props = $props();

	let merged = $derived(entry.status === 'merged');
</script>

<div
	class="mb-6 rounded-lg border p-4 {merged
		? 'border-green-500/30 bg-green-500/10'
		: 'border-primary/20 bg-primary/10'}"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class={merged ? 'text-green-700 dark:text-green-500' : 'text-primary'}>
			{#if merged}
				Merged — going live with tonight's dataset build.
			{:else}
				Submitted — awaiting review.
			{/if}
		</p>
		{#if entry.prUrl}
			<a
				href={entry.prUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="shrink-0 text-sm text-primary hover:underline"
			>
				View submission #{entry.prNumber} ↗
			</a>
		{/if}
	</div>
	{#if !merged}
		<p class="mt-1 text-xs text-muted-foreground">
			Further edits here can be added to that same submission when you submit again.
		</p>
	{/if}
</div>
