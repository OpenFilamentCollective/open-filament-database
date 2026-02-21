/**
 * Entity Service
 *
 * Centralized service for entity operations used by both the webui and future browser extension.
 * Contains:
 * - ID/slug generation
 * - Change detection helpers
 * - Entity deletion with cloud/local mode handling
 * - Entity data merging
 */

import { get } from 'svelte/store';
import { changeStore } from '$lib/stores/changes';
import { useChangeTracking } from '$lib/stores/environment';

// ============ ID Generation ============

/**
 * Generate a URL-friendly lowercase slug from a name
 * Used for: brands, stores, filaments, variants
 */
export function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');
}

/**
 * Generate an uppercase material type ID
 * Materials use uppercase IDs (e.g., "PLA", "PETG", "ABS")
 */
export function generateMaterialType(material: string): string {
	return material
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

// ============ Change Detection ============

/**
 * Check if entity has local changes (create or update)
 * @param entityPath - The entity path in changeStore (e.g., "brands/prusament")
 */
export function hasLocalChanges(entityPath: string): boolean {
	if (!get(useChangeTracking)) return false;
	const change = get(changeStore)._index.get(entityPath)?.change;
	return change !== undefined && (change.operation === 'create' || change.operation === 'update');
}

/**
 * Check if entity was locally created (not yet synced to cloud)
 * @param entityPath - The entity path in changeStore
 */
export function isLocallyCreated(entityPath: string): boolean {
	if (!get(useChangeTracking)) return false;
	return get(changeStore)._index.get(entityPath)?.change?.operation === 'create';
}

// ============ Entity Operations ============

export interface DeleteResult {
	success: boolean;
	message: string;
	isLocalRemoval?: boolean;
}

/**
 * Handle entity deletion with cloud/local mode logic
 *
 * In cloud mode:
 * - If entity was locally created, just removes the change (no API call)
 * - Otherwise, marks for deletion (tracked in changeStore)
 *
 * In local mode:
 * - Calls the delete function to remove from filesystem
 *
 * @param entityPath - The entity path for change tracking
 * @param entityLabel - Human-readable label (e.g., "Brand", "Material")
 * @param deleteFunction - Async function that performs the actual deletion
 */
export async function deleteEntity(
	entityPath: string,
	entityLabel: string,
	deleteFunction: () => Promise<boolean>
): Promise<DeleteResult> {
	if (get(useChangeTracking)) {
		const change = get(changeStore)._index.get(entityPath)?.change;

		if (change?.operation === 'create') {
			// Entity was created locally but not synced - just remove the change
			changeStore.removeChange(entityPath);
			return {
				success: true,
				message: `Local ${entityLabel.toLowerCase()} creation removed`,
				isLocalRemoval: true
			};
		} else {
			// Mark existing entity for deletion
			await deleteFunction();
			return {
				success: true,
				message: `${entityLabel} marked for deletion - export to save`
			};
		}
	} else {
		// Local mode - actually delete from filesystem
		const success = await deleteFunction();
		return {
			success,
			message: success
				? `${entityLabel} deleted successfully`
				: `Failed to delete ${entityLabel.toLowerCase()}`
		};
	}
}

/**
 * Merge form data with existing entity, preserving system fields
 *
 * Form data takes precedence, but specified fields are always preserved
 * from the original entity (typically 'id' and 'slug').
 *
 * @param existing - The current entity data
 * @param formData - New data from the form
 * @param preserveFields - Fields to always keep from existing data
 */
export function mergeEntityData<T extends Record<string, unknown>>(
	existing: T,
	formData: Partial<T>,
	preserveFields: (keyof T)[] = ['id', 'slug'] as (keyof T)[]
): T {
	const merged = { ...existing, ...formData };

	for (const field of preserveFields) {
		if (existing[field] !== undefined) {
			merged[field] = existing[field];
		}
	}

	return merged;
}
