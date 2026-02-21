/**
 * Delete Handler Composable
 *
 * Extracts the handleDelete() pattern shared across all detail pages.
 */

import { goto } from '$app/navigation';
import { deleteEntity } from '$lib/services/entityService';
import type { createEntityState } from '$lib/utils/entityState.svelte';
import type { createMessageHandler } from '$lib/utils/messageHandler.svelte';

export interface DeleteHandlerConfig {
	/** Function returning the entity (for null guard) */
	getEntity: () => any;
	/** Function returning the entity path for change tracking, e.g. "brands/acme" */
	getEntityPath: () => string;
	/** Human-readable type, e.g. "Brand", "Material" */
	entityLabel: string;
	/** The actual delete call to DatabaseService */
	deleteCallback: () => Promise<boolean>;
	/** URL to redirect to after successful delete (function to support reactive params) */
	getRedirectPath: () => string;
	/** Delay before redirect (ms) */
	redirectDelay?: number;
	/** Entity state for deleting flag and modal close */
	entityState: ReturnType<typeof createEntityState>;
	/** Message handler for success/error messages */
	messageHandler: ReturnType<typeof createMessageHandler>;
}

/**
 * Create a delete handler function for a detail page.
 *
 * @example
 * ```typescript
 * const handleDelete = createDeleteHandler({
 *   getEntity: () => brand,
 *   getEntityPath: () => `brands/${brandId}`,
 *   entityLabel: 'Brand',
 *   deleteCallback: () => db.deleteBrand(brandId, brand!),
 *   getRedirectPath: () => '/brands',
 *   entityState,
 *   messageHandler
 * });
 * ```
 */
export function createDeleteHandler(config: DeleteHandlerConfig): () => Promise<void> {
	const { redirectDelay = 1500 } = config;

	return async () => {
		if (!config.getEntity()) return;

		config.entityState.deleting = true;
		config.messageHandler.clear();

		try {
			const result = await deleteEntity(
				config.getEntityPath(),
				config.entityLabel,
				config.deleteCallback
			);

			if (result.success) {
				config.messageHandler.showSuccess(result.message);
				config.entityState.closeDelete();
				setTimeout(() => {
					goto(config.getRedirectPath());
				}, redirectDelay);
			} else {
				config.messageHandler.showError(result.message);
				config.entityState.deleting = false;
			}
		} catch (e) {
			config.messageHandler.showError(
				e instanceof Error ? e.message : `Failed to delete ${config.entityLabel.toLowerCase()}`
			);
			config.entityState.deleting = false;
		}
	};
}
