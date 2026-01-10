<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { navigating } from '$app/stores';
	import { validationStore } from '$lib/stores/validationStore';
	import { useSSE } from '$lib/hooks/useSSE';
	import ValidationProgressModal from './ValidationProgressModal.svelte';

	let showModal = $state(false);
	let currentJobId = $state<string | null>(null);
	let checkInterval: NodeJS.Timeout | null = null;
	const sse = useSSE();

	// Function to check validation status and reconnect if needed
	async function checkValidationStatus() {
		// Don't check if already connected or modal is open
		if ($validationStore.isValidating || showModal) {
			return;
		}

		try {
			const response = await fetch('/api/validate/status');
			if (response.ok) {
				const { running, jobId } = await response.json();
				if (running) {
					// Silently reconnect to existing validation
					validationStore.setValidating(true);
					currentJobId = jobId;

					// Connect to SSE stream in background
					sse.connect('/api/validate/stream/current', {
						onProgress: () => {
							// Silent progress updates
						},
						onComplete: (result) => {
							if (result.errors !== undefined) {
								validationStore.setResults(result);
							}
							validationStore.setValidating(false);
						},
						onError: (err) => {
							console.error('Background validation error:', err);
							validationStore.setValidating(false);
						}
					});
				}
			}
		} catch (error) {
			console.error('Failed to check validation status:', error);
		}
	}

	// Check for running validation on mount
	onMount(async () => {
		await checkValidationStatus();

		// Poll for validation status every 3 seconds
		checkInterval = setInterval(checkValidationStatus, 3000);
	});

	// Clean up interval on unmount
	onDestroy(() => {
		if (checkInterval) {
			clearInterval(checkInterval);
		}
	});

	async function runValidation() {
		validationStore.setValidating(true);

		try {
			const response = await fetch('/api/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'full' })
			});

			if (!response.ok) {
				if (response.status === 409) {
					const { error } = await response.json();
					alert(error || 'A validation is already running. Please wait for it to complete.');
				} else {
					alert('Failed to start validation. Please try again.');
				}
				validationStore.setValidating(false);
				return;
			}

			const { jobId } = await response.json();
			currentJobId = jobId;
			showModal = true;
		} catch (error) {
			console.error('Failed to start validation:', error);
			validationStore.setValidating(false);
			alert('Failed to start validation. Please try again.');
		}
	}

	function handleClose() {
		showModal = false;
		validationStore.setValidating(false);
	}
</script>

<button
	onclick={runValidation}
	class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
	disabled={$validationStore.isValidating}
>
	{#if $validationStore.isValidating}
		<span class="inline-flex items-center">
			<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
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
			Validating...
		</span>
	{:else}
		Validate
	{/if}
</button>

<ValidationProgressModal
	isOpen={showModal}
	jobId={currentJobId}
	jobType="validation"
	onClose={handleClose}
/>
