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
	let completionResult = $state<{ errorCount: number; warningCount: number } | null>(null);
	let isComplete = $state(false);

	const sse = useSSE();

	$effect(() => {
		if (isOpen && jobId) {
			// Reset state for new job
			completionResult = null;
			isComplete = false;
			error = null;
			progress = { stage: '', percent: 0, message: '' };

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
					let validationData = null;
					if (result && result.errors !== undefined) {
						validationData = result;
						validationStore.setResults(result);
					} else if (result && result.validation !== undefined) {
						validationData = result.validation;
						validationStore.setResults(result.validation);
					}

					// If there are validation errors/warnings, show summary instead of closing
					if (validationData && (validationData.error_count > 0 || validationData.warning_count > 0)) {
						completionResult = {
							errorCount: validationData.error_count || 0,
							warningCount: validationData.warning_count || 0,
						};
						isComplete = true;
					} else {
						// No errors or no result — close immediately
						onClose();
					}
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
		class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
		onclick={onClose}
		aria-label="validation-progress-title"
		role="button"
		tabindex="-1"
	>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-labelledby="validation-progress-title"
			aria-modal="true"
			tabindex="-1"
		>
			{#if isComplete && completionResult}
				<!-- Completion summary with errors/warnings -->
				<h2 class="text-xl font-bold mb-4 dark:text-white">
					Operation Complete
				</h2>

				<div class="space-y-3 mb-4">
					{#if completionResult.errorCount > 0}
						<div class="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
							<span class="text-red-600 dark:text-red-400 text-2xl font-bold">{completionResult.errorCount}</span>
							<span class="text-red-700 dark:text-red-300 font-medium">
								{completionResult.errorCount === 1 ? 'Error' : 'Errors'}
							</span>
						</div>
					{/if}
					{#if completionResult.warningCount > 0}
						<div class="flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3">
							<span class="text-yellow-600 dark:text-yellow-400 text-2xl font-bold">{completionResult.warningCount}</span>
							<span class="text-yellow-700 dark:text-yellow-300 font-medium">
								{completionResult.warningCount === 1 ? 'Warning' : 'Warnings'}
							</span>
						</div>
					{/if}
				</div>

				<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
					Check the Validation dropdown for details.
				</p>

				<button
					onclick={onClose}
					class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors"
				>
					Close
				</button>
			{:else}
				<!-- Progress view -->
				<h2 class="text-xl font-bold mb-4 dark:text-white">
					{jobType === 'validation' ? 'Running Validation...' : 'Sorting & Validating...'}
				</h2>

				{#if error}
					<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
						<strong>Error:</strong>
						{error}
					</div>
				{:else}
					<div class="mb-4">
						<div class="bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
							<div
								class="bg-blue-600 h-full transition-all duration-300"
								style="width: {progress.percent}%"
							></div>
						</div>
						<p class="text-sm mt-2 dark:text-gray-300">
							{progress.stage || 'Initializing...'}
						</p>
						{#if progress.message}
							<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">{progress.message}</p>
						{/if}
					</div>

					<div class="text-center">
						<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600">
						</div>
					</div>
				{/if}

				<button
					onclick={onClose}
					class="mt-4 w-full bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded"
				>
					Close
				</button>
			{/if}
		</div>
	</div>
{/if}
