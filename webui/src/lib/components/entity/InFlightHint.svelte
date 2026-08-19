<script lang="ts">
	/**
	 * "This is already in an open submission" hint, for a form's parent entity.
	 *
	 * A contributor who cannot see that PR #459 already covers this filament has no
	 * reason not to create it again — which is exactly what #460 did, four minutes
	 * later. Showing it at the point of editing is what makes the amend offer in the
	 * submit wizard unsurprising rather than a modal out of nowhere.
	 *
	 * Renders nothing when the path is not in an open submission.
	 */
	import { submittedStore } from '$lib/stores/submitted';
	import { FixHint } from '$lib/components/ui';

	interface Props {
		/** Entity path whose submission state to report, e.g. the parent filament's. */
		path: string | null | undefined;
		/** What the path refers to, for the sentence ("filament", "brand", ...). */
		label?: string;
	}

	let { path, label = 'entry' }: Props = $props();

	let entry = $derived.by(() => {
		void $submittedStore; // re-run when the buffer changes
		if (!path) return undefined;
		const found = submittedStore.getChange(path)?.entry;
		if (!found) return undefined;
		const status = found.status ?? 'open';
		return status === 'open' || status === 'changes_requested' ? found : undefined;
	});
</script>

{#if entry}
	<FixHint level="info" href={entry.prUrl} hrefLabel="View #{entry.prNumber} ↗" class="mb-4">
		This {label} is in review as part of submission
		<strong>#{entry.prNumber}</strong>. When you submit, these changes can be added to it
		instead of opening a second pull request.
	</FixHint>
{/if}
