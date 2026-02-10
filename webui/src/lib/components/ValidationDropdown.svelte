<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { errorCount, warningCount, errorsByCategory, validationStore } from '$lib/stores/validationStore';
	import { useSSE } from '$lib/hooks/useSSE';
	import { pathToRoute } from '$lib/utils/pathToRoute';
	import { goto } from '$app/navigation';
	import type { ValidationError } from '$lib/stores/validationStore';
	import ValidationProgressModal from './ValidationProgressModal.svelte';

	let isOpen = $state(false);
	let checkInterval: NodeJS.Timeout | null = null;
	const sse = useSSE();

	// Sort & Validate state
	let showModal = $state(false);
	let currentJobId = $state<string | null>(null);
	let isRunning = $state(false);

	async function runSortAndValidate() {
		isRunning = true;
		validationStore.setValidating(true);

		try {
			const response = await fetch('/api/sort', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dryRun: false, runValidation: true })
			});

			if (!response.ok) {
				if (response.status === 409) {
					const { error } = await response.json();
					alert(error || 'An operation is already running. Please wait for it to complete.');
				} else {
					alert('Failed to start operation. Please try again.');
				}
				isRunning = false;
				validationStore.setValidating(false);
				return;
			}

			const { jobId } = await response.json();
			currentJobId = jobId;
			showModal = true;
		} catch (error) {
			console.error('Failed to start sort & validate:', error);
			isRunning = false;
			validationStore.setValidating(false);
			alert('Failed to start operation. Please try again.');
		}
	}

	function handleModalClose() {
		showModal = false;
		isRunning = false;
		validationStore.setValidating(false);
	}

	// Function to check for running operations and reconnect if needed
	async function checkOperationStatus() {
		if ($validationStore.isValidating) {
			return;
		}

		try {
			const response = await fetch('/api/validate/status');
			if (response.ok) {
				const { running, jobId } = await response.json();
				if (running) {
					// Silently reconnect to existing operation
					validationStore.setValidating(true);

					// Connect to SSE stream in background
					sse.connect('/api/validate/stream/current', {
						onProgress: () => {
							// Silent progress updates
						},
						onComplete: (result) => {
							if (result && result.errors !== undefined) {
								validationStore.setResults(result);
							} else if (result && result.validation !== undefined) {
								validationStore.setResults(result.validation);
							}
							validationStore.setValidating(false);
						},
						onError: (err) => {
							console.error('Background operation error:', err);
							validationStore.setValidating(false);
						}
					});
				}
			}
		} catch (error) {
			console.error('Failed to check operation status:', error);
		}
	}

	// Check for running operations on mount
	onMount(async () => {
		await checkOperationStatus();

		// Poll for status every 3 seconds
		checkInterval = setInterval(checkOperationStatus, 3000);
	});

	// Clean up interval on unmount
	onDestroy(() => {
		if (checkInterval) {
			clearInterval(checkInterval);
		}
	});

	function handleErrorClick(error: ValidationError) {
		if (error.path) {
			const route = pathToRoute(error.path);
			goto(route);
			isOpen = false;
		}
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (isOpen) {
			const target = event.target as HTMLElement;
			if (!target.closest('.validation-dropdown')) {
				isOpen = false;
			}
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="validation-dropdown relative">
	<button
		onclick={toggleDropdown}
		aria-expanded="{isOpen}"
		class="relative px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
	>
		<span class="flex items-center gap-2">
			{#if $validationStore.isValidating}
				<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
					<circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<span>Processing...</span>
			{:else}
				<span>Validation</span>
			{/if}
		</span>
		{#if $errorCount + $warningCount > 0}
			<span
				class="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 rounded-full {$errorCount >
				0
					? 'bg-red-600'
					: 'bg-yellow-600'}"
			>
				{$errorCount + $warningCount}
			</span>
		{/if}
	</button>

	{#if isOpen}
		<div
			class="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-[32rem] overflow-y-auto z-50"
			role="menu"
			aria-label="Validation results"
		>
			<!-- Validation Results -->
			{#if $errorCount + $warningCount === 0}
				<div class="p-4 text-center text-green-600 dark:text-green-400" role="menuitem">
					<svg class="w-8 h-8 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
							clip-rule="evenodd"
						/>
					</svg>
					<p class="font-medium">No validation issues</p>
					<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
						All checks passed successfully
					</p>
				</div>
			{:else}
				<div class="divide-y divide-gray-200 dark:divide-gray-700" role="menuitem">
					{#each [...$errorsByCategory.entries()] as [category, errors]}
						<div>
							<div class="bg-gray-50 dark:bg-gray-900 px-4 py-2 sticky top-0">
								<h4 class="font-semibold text-sm text-gray-900 dark:text-white">
									{category}
									<span class="text-gray-500 dark:text-gray-400">({errors.length})</span>
								</h4>
							</div>
							<div class="divide-y divide-gray-100 dark:divide-gray-700">
								{#each errors.slice(0, 5) as error}
									<button
										class="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors {error.level ===
										'ERROR'
											? 'border-l-4 border-red-500'
											: 'border-l-4 border-yellow-500'}"
										onclick={() => handleErrorClick(error)}
									>
										<div class="flex items-start gap-2">
											<span class="text-lg flex-shrink-0">
												{error.level === 'ERROR' ? '✗' : '⚠'}
											</span>
											<div class="flex-1 min-w-0">
												<p class="text-sm font-medium text-gray-900 dark:text-white truncate">
													{error.message}
												</p>
												{#if error.path}
													<p class="text-xs text-gray-600 dark:text-gray-400 truncate">
														{error.path}
													</p>
												{/if}
											</div>
										</div>
									</button>
								{/each}
								{#if errors.length > 5}
									<div class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 text-center">
										... and {errors.length - 5} more
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Sort & Validate button at bottom -->
			<div class="sticky bottom-0 p-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
				<button
					onclick={() => runSortAndValidate()}
					disabled={isRunning}
					class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if isRunning}
						<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						Processing...
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5.636 18.364a9 9 0 1012.728 0M12 3v9" />
						</svg>
						Sort & Validate
					{/if}
				</button>
			</div>
		</div>
	{/if}
</div>

<ValidationProgressModal
	isOpen={showModal}
	jobId={currentJobId}
	jobType="sort"
	onClose={handleModalClose}
/>
