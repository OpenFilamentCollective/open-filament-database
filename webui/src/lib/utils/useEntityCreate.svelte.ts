/**
 * Child Entity Create Handler Composable
 *
 * Extracts the handleCreate() pattern shared across detail pages
 * that create child entities (brand→material, material→filament, filament→variant).
 */

import type { createEntityState } from '$lib/utils/entityState.svelte';
import type { createMessageHandler } from '$lib/utils/messageHandler.svelte';

export interface ChildCreateConfig {
	/** Async creation function that returns a result with success and an entity ID */
	createFn: (data: any) => Promise<{ success: boolean; [key: string]: any }>;
	/** Key in the result that contains the new entity's ID */
	resultIdKey: string;
	/** Build the redirect URL from the result ID */
	getRedirectPath: (resultId: string) => string;
	/** Human-readable child type for messages, e.g. "Material", "Filament" */
	childLabel: string;
	/** Redirect delay (ms) */
	redirectDelay?: number;
	/** Entity state for creating flag and modal close */
	entityState: ReturnType<typeof createEntityState>;
	/** Message handler for success/error messages */
	messageHandler: ReturnType<typeof createMessageHandler>;
	/** Optional pre-create validation; return error message string or null */
	validate?: (data: any) => string | null;
}

/**
 * Create a child-entity creation handler function.
 *
 * @example
 * ```typescript
 * const handleCreateFilament = createChildCreateHandler({
 *   createFn: (data) => db.createFilament(brandId, materialType, data),
 *   resultIdKey: 'filamentId',
 *   getRedirectPath: (id) => `/brands/${brandId}/${materialType}/${id}`,
 *   childLabel: 'Filament',
 *   entityState,
 *   messageHandler
 * });
 * ```
 */
export function createChildCreateHandler(config: ChildCreateConfig): (data: any) => Promise<void> {
	const { redirectDelay = 500 } = config;

	return async (data: any) => {
		config.entityState.creating = true;
		config.messageHandler.clear();

		try {
			if (config.validate) {
				const error = config.validate(data);
				if (error) {
					config.messageHandler.showError(error);
					config.entityState.creating = false;
					return;
				}
			}

			const result = await config.createFn(data);

			if (result.success && result[config.resultIdKey]) {
				config.messageHandler.showSuccess(`${config.childLabel} created successfully!`);
				config.entityState.closeCreate();
				setTimeout(() => {
					window.location.href = config.getRedirectPath(result[config.resultIdKey]);
				}, redirectDelay);
			} else {
				config.messageHandler.showError(`Failed to create ${config.childLabel.toLowerCase()}`);
			}
		} catch (e) {
			config.messageHandler.showError(
				e instanceof Error ? e.message : `Failed to create ${config.childLabel.toLowerCase()}`
			);
		} finally {
			config.entityState.creating = false;
		}
	};
}
