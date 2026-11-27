<script lang="ts">
	/**
	 * Shown on every page while a pull request is loaded for revision: which PR, how much
	 * feedback, and a way out. Submitting happens from the Changes menu as usual.
	 *
	 * Stopping drops the loaded copy of the PR from the editor. That only needs confirming when
	 * the visitor actually changed something since loading; the PR itself is untouched either way.
	 */
	import { revisionStore } from '$lib/stores/revision';
	import { Button } from '$lib/components/ui';

	let confirmingStop = $state(false);

	let total = $derived($revisionStore?.feedback.length ?? 0);
	let maintainer = $derived($revisionStore?.as === 'maintainer');

	function stop() {
		revisionStore.clear({ discardChanges: true });
		confirmingStop = false;
	}

	function requestStop() {
		if (revisionStore.hasEdits()) confirmingStop = true;
		else stop();
	}
</script>

{#if $revisionStore}
	<div class="border-b border-warning-border bg-warning-surface">
		<div class="container mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
			<p class="min-w-0 flex-1 text-warning-foreground">
				<span class="font-semibold">
					{maintainer
						? `Fixing #${$revisionStore.prNumber} as a maintainer`
						: 'Fixing your contribution'}
				</span>
				<span class="text-warning-foreground/80">
					· {total} thing{total === 1 ? '' : 's'} to look at · {$revisionStore.mode === 'amend'
						? maintainer
							? 'submitting pushes your fix onto the pull request'
							: 'your fixes go to the reviewer when you submit'
						: 'submitting sends your fixed version for review'}
				</span>
			</p>
			<div class="flex items-center gap-2">
				{#if confirmingStop}
					<span class="text-xs text-muted-foreground"
						>Throw away the edits you made here? The pull request stays as it is.</span
					>
					<Button onclick={stop} variant="destructive" size="sm">Discard edits</Button>
					<Button onclick={() => (confirmingStop = false)} variant="ghost" size="sm">Keep</Button>
				{:else}
					<Button onclick={requestStop} variant="ghost" size="sm">Stop fixing</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}
