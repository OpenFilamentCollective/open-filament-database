import { onMount, onDestroy } from 'svelte';
import { validationStore } from '$lib/stores/validationStore';
import { useSSE } from './useSSE';

export interface UseValidationPollingOptions {
	pollInterval?: number;
	autoStart?: boolean;
	onReconnect?: () => void;
}

export interface UseValidationPollingReturn {
	startPolling: () => void;
	stopPolling: () => void;
	checkStatus: () => Promise<void>;
	runValidation: () => Promise<{ jobId: string } | null>;
	sse: ReturnType<typeof useSSE>;
}

export function useValidationPolling(
	options: UseValidationPollingOptions = {}
): UseValidationPollingReturn {
	const { pollInterval = 3000, autoStart = true, onReconnect } = options;

	let checkInterval: NodeJS.Timeout | null = null;
	const sse = useSSE();

	async function checkStatus(): Promise<void> {
		// Don't check if already validating
		if (validationStore.isValidating()) {
			return;
		}

		try {
			const response = await fetch('/api/validate/status');
			if (response.ok) {
				const { running, jobId } = await response.json();
				if (running) {
					// Silently reconnect to existing validation
					validationStore.setValidating(true);
					onReconnect?.();

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

					return;
				}
			}
		} catch (error) {
			console.error('Failed to check validation status:', error);
		}
	}

	async function runValidation(): Promise<{ jobId: string } | null> {
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
				return null;
			}

			const { jobId } = await response.json();
			return { jobId };
		} catch (error) {
			console.error('Failed to start validation:', error);
			validationStore.setValidating(false);
			alert('Failed to start validation. Please try again.');
			return null;
		}
	}

	function startPolling(): void {
		if (checkInterval) return;
		checkInterval = setInterval(checkStatus, pollInterval);
	}

	function stopPolling(): void {
		if (checkInterval) {
			clearInterval(checkInterval);
			checkInterval = null;
		}
	}

	if (autoStart) {
		onMount(async () => {
			await checkStatus();
			startPolling();
		});

		onDestroy(() => {
			stopPolling();
		});
	}

	return {
		startPolling,
		stopPolling,
		checkStatus,
		runValidation,
		sse
	};
}
