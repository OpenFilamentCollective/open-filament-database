/**
 * Entity Loader Utility
 *
 * Composable for managing entity data loading with loading/error states.
 * Uses Svelte 5 runes for reactivity.
 */

export interface LoadOptions {
	/** Whether to validate the response for an error property */
	validate?: boolean;
	/** Error message to show if entity not found */
	notFoundMessage?: string;
}

/**
 * Create an entity loader with reactive state
 * @returns Object with loading/error state and methods to load data
 */
export function createEntityLoader() {
	let loading = $state(true);
	let error = $state<string | null>(null);

	/**
	 * Load a single entity from an endpoint
	 * @param endpoint - API endpoint to fetch from
	 * @param options - Loading options
	 * @returns The loaded entity data, or null if failed
	 */
	async function loadEntity<T>(endpoint: string, options: LoadOptions = {}): Promise<T | null> {
		const { validate = false, notFoundMessage = 'Entity not found' } = options;

		loading = true;
		error = null;

		try {
			const { apiFetch } = await import('$lib/utils/api');
			const response = await apiFetch(endpoint);
			const data = await response.json();

			// Validate response for error property if requested
			if (validate && data.error) {
				error = notFoundMessage;
				loading = false;
				return null;
			}

			return data as T;
		} catch (e) {
			error = e instanceof Error ? e.message : `Failed to load from ${endpoint}`;
			return null;
		} finally {
			loading = false;
		}
	}

	/**
	 * Load multiple entities in parallel using Promise.all
	 * @param requests - Array of endpoint strings or request objects
	 * @returns Array of loaded data, or null if any request failed
	 */
	async function loadMultiple<T extends any[]>(
		requests: Array<
			| string
			| {
					endpoint: string;
					validate?: boolean;
					notFoundMessage?: string;
			  }
		>
	): Promise<T | null> {
		loading = true;
		error = null;

		try {
			const { apiFetch } = await import('$lib/utils/api');

			// Convert all requests to promises
			const promises = requests.map(async (request) => {
				const endpoint = typeof request === 'string' ? request : request.endpoint;
				const validate = typeof request === 'string' ? false : request.validate ?? false;
				const notFoundMessage =
					typeof request === 'string' ? 'Entity not found' : request.notFoundMessage ?? 'Entity not found';

				const response = await apiFetch(endpoint);
				const data = await response.json();

				// Validate if requested
				if (validate && data.error) {
					throw new Error(notFoundMessage);
				}

				return data;
			});

			const results = await Promise.all(promises);
			return results as T;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
			return null;
		} finally {
			loading = false;
		}
	}

	/**
	 * Reset the loader state
	 */
	function reset(): void {
		loading = true;
		error = null;
	}

	/**
	 * Set error state manually
	 */
	function setError(errorMessage: string): void {
		error = errorMessage;
		loading = false;
	}

	return {
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		loadEntity,
		loadMultiple,
		reset,
		setError
	};
}
