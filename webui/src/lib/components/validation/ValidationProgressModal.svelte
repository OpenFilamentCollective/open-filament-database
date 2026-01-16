<script lang="ts">
	import { useSSE } from '$lib/hooks/useSSE';
	import { validationStore } from '$lib/stores/validationStore';

	interface Props {
		isOpen: boolean;
		jobId: string | null;
		jobType?: 'validation' | 'sort';
		onClose: () => void;
	}

	let { isOpen = $bindable(), jobId, jobType = 'validation', onClose }: Props = $props();

	let progress = $state({ stage: '', percent: 0, message: '' });
	let error = $state<string | null>(null);

	const sse = useSSE();

	$effect(() => {
		if (isOpen && jobId) {
			const url =
				jobType === 'validation'
					? `/api/validate/stream/${jobId}`
					: `/api/sort/stream/${jobId}`;

			sse.connect(url, {
				onProgress: (data) => {
					progress = data;
					error = null;
				},
				onComplete: (result) => {
					// Update validation store if this was a validation or a sort with validation
					if (result.errors !== undefined) {
						validationStore.setResults(result);
					} else if (result.validation !== undefined) {
						validationStore.setResults(result.validation);
					}
					onClose();
				},
				onError: (err) => {
					console.error('SSE error:', err);
					error = err.message || 'Connection error';
					validationStore.setValidating(false);
				}
			});
		}

		return () => {
			sse.disconnect();
		};
	});
</script>

{#if isOpen}
	<div
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
		onclick={onClose}
		aria-label="validation-progress-title"
		role="button"
		tabindex="-1"
	>
		<div
			class="bg-card dark:bg-card rounded-lg p-6 max-w-md w-full mx-4"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-labelledby="validation-progress-title"
			aria-modal="true"
			tabindex="-1"
		>
			<h2 class="text-xl font-bold mb-4 text-foreground">
				{jobType === 'validation' ? 'Running Validation...' : 'Sorting Data...'}
			</h2>

			{#if error}
				<div class="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded mb-4">
					<strong>Error:</strong>
					{error}
				</div>
			{:else}
				<div class="mb-4">
					<div class="bg-muted dark:bg-muted rounded-full h-4 overflow-hidden">
						<div
							class="bg-primary h-full transition-all duration-300"
							style="width: {progress.percent}%"
						></div>
					</div>
					<p class="text-sm mt-2 text-foreground">
						{progress.stage || 'Initializing...'}
					</p>
					{#if progress.message}
						<p class="text-xs text-muted-foreground dark:text-muted-foreground mt-1">{progress.message}</p>
					{/if}
				</div>

				<div class="text-center">
					<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary">
					</div>
				</div>
			{/if}

			<button
				onclick={onClose}
				class="bg-muted text-muted-foreground hover:bg-muted/80 px-4 py-2 rounded-md mt-4 w-full font-semibold"
			>
				Close
			</button>
		</div>
	</div>
{/if}
