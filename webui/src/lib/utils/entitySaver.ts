/**
 * Entity Saver Utility
 *
 * Standardized functions for saving entity data with consistent error handling.
 */

export interface SaveOptions {
	/** HTTP method to use (default: 'PUT') */
	method?: 'PUT' | 'POST' | 'PATCH';
	/** Callback on successful save */
	onSuccess?: (data: any) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
}

export interface SaveResult {
	/** Whether the save was successful */
	success: boolean;
	/** The saved data (if successful) */
	data?: any;
	/** Error message (if failed) */
	error?: string;
}

/**
 * Save an entity to the server
 * @param endpoint - API endpoint to save to
 * @param data - Entity data to save
 * @param options - Save options
 * @returns Result object with success status and data/error
 */
export async function saveEntity(
	endpoint: string,
	data: any,
	options: SaveOptions = {}
): Promise<SaveResult> {
	const { method = 'PUT', onSuccess, onError } = options;

	try {
		const response = await fetch(endpoint, {
			method,
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (response.ok) {
			const responseData = await response.json().catch(() => data);

			if (onSuccess) {
				onSuccess(responseData);
			}

			return {
				success: true,
				data: responseData
			};
		} else {
			const errorMessage = `Failed to save: ${response.statusText}`;
			const saveError = new Error(errorMessage);

			if (onError) {
				onError(saveError);
			}

			return {
				success: false,
				error: errorMessage
			};
		}
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Failed to save entity';
		const saveError = e instanceof Error ? e : new Error(errorMessage);

		if (onError) {
			onError(saveError);
		}

		return {
			success: false,
			error: errorMessage
		};
	}
}

/**
 * Create an entity (POST request)
 * @param endpoint - API endpoint to create at
 * @param data - Entity data to create
 * @param options - Save options (method will be overridden to POST)
 * @returns Result object with success status and data/error
 */
export async function createEntity(
	endpoint: string,
	data: any,
	options: Omit<SaveOptions, 'method'> = {}
): Promise<SaveResult> {
	return saveEntity(endpoint, data, { ...options, method: 'POST' });
}

/**
 * Update an entity (PUT request)
 * @param endpoint - API endpoint to update at
 * @param data - Entity data to update
 * @param options - Save options (method will be overridden to PUT)
 * @returns Result object with success status and data/error
 */
export async function updateEntity(
	endpoint: string,
	data: any,
	options: Omit<SaveOptions, 'method'> = {}
): Promise<SaveResult> {
	return saveEntity(endpoint, data, { ...options, method: 'PUT' });
}

/**
 * Patch an entity (PATCH request)
 * @param endpoint - API endpoint to patch at
 * @param data - Partial entity data to patch
 * @param options - Save options (method will be overridden to PATCH)
 * @returns Result object with success status and data/error
 */
export async function patchEntity(
	endpoint: string,
	data: any,
	options: Omit<SaveOptions, 'method'> = {}
): Promise<SaveResult> {
	return saveEntity(endpoint, data, { ...options, method: 'PATCH' });
}
