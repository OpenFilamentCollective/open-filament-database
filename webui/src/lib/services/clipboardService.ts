/**
 * Clipboard Service
 *
 * Manages copy/paste of entity data with type safety.
 * Uses localStorage as primary store, and also writes to
 * the system clipboard for cross-tab sharing.
 */

import { browser } from '$app/environment';

export type ClipboardEntityType = 'brand' | 'material' | 'filament' | 'variant' | 'store';

export interface ClipboardEntry {
	entityType: ClipboardEntityType;
	data: Record<string, any>;
	/** Nested children data, keyed by child type */
	children?: Record<string, any[]>;
	copiedAt: string;
	sourcePath?: string;
}

const STORAGE_KEY = 'ofd_clipboard';

/**
 * Identity/routing fields that must be stripped when duplicating or pasting.
 * These are regenerated on creation (slug from name, id from slug, etc).
 * ALL entity data fields NOT in this list are preserved as-is.
 */
const IDENTITY_FIELDS = ['id', 'slug', 'brandId', 'filamentDir'] as const;

/**
 * Additional identity fields to strip per entity type.
 * materialType is identity for materials (generated from material name)
 * but a useful reference field for filaments.
 */
const TYPE_IDENTITY_FIELDS: Partial<Record<ClipboardEntityType, string[]>> = {
	material: ['materialType']
};

/**
 * The field that holds the "name" for each entity type.
 */
const NAME_FIELD: Record<ClipboardEntityType, string> = {
	brand: 'name',
	material: 'material',
	filament: 'name',
	variant: 'name',
	store: 'name'
};

/**
 * Deep-clone entity data and strip only identity/routing fields.
 * All actual data fields are preserved. This is the SINGLE source of truth
 * for preparing entity data for duplication or pasting.
 *
 * @param entityType - The type of entity
 * @param data - The entity data to prepare
 * @param renameSuffix - If provided, appends this to the name field (e.g. " (Copy)")
 */
export function prepareEntityData(
	entityType: ClipboardEntityType,
	data: Record<string, any>,
	renameSuffix?: string
): Record<string, any> {
	const clone = JSON.parse(JSON.stringify(data));

	// Strip universal identity fields
	for (const field of IDENTITY_FIELDS) {
		delete clone[field];
	}

	// Strip type-specific identity fields
	const extraFields = TYPE_IDENTITY_FIELDS[entityType];
	if (extraFields) {
		for (const field of extraFields) {
			delete clone[field];
		}
	}

	// Optionally rename
	if (renameSuffix) {
		const nameField = NAME_FIELD[entityType];
		if (clone[nameField]) {
			clone[nameField] = `${clone[nameField]}${renameSuffix}`;
		}
	}

	return clone;
}

/**
 * Prepare entity data for duplication (appends " (Copy)" to name).
 * Delegates to prepareEntityData - exists for backward compatibility.
 */
export function prepareDuplicateData(
	entityType: ClipboardEntityType,
	data: Record<string, any>
): Record<string, any> {
	return prepareEntityData(entityType, data, ' (Copy)');
}

/**
 * Copy an entity to the clipboard (localStorage + system clipboard).
 * Optionally include children data for "copy with children".
 */
export async function copyEntity(
	entityType: ClipboardEntityType,
	data: Record<string, any>,
	sourcePath?: string,
	children?: Record<string, any[]>
): Promise<void> {
	const entry: ClipboardEntry = {
		entityType,
		data: JSON.parse(JSON.stringify(data)),
		copiedAt: new Date().toISOString(),
		sourcePath
	};

	if (children) {
		entry.children = JSON.parse(JSON.stringify(children));
	}

	const json = JSON.stringify(entry);

	if (browser) {
		localStorage.setItem(STORAGE_KEY, json);

		// Also try system clipboard for cross-tab/app sharing
		try {
			await navigator.clipboard.writeText(json);
		} catch {
			// Clipboard API may not be available (permissions, insecure context)
		}
	}
}

/**
 * Get the current clipboard entry from localStorage.
 */
export function getClipboard(): ClipboardEntry | null {
	if (!browser) return null;

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const entry = JSON.parse(raw) as ClipboardEntry;
		if (!entry.entityType || !entry.data) return null;
		return entry;
	} catch {
		return null;
	}
}

/**
 * Check if the clipboard has data compatible with the given entity type.
 */
export function hasCompatibleClipboard(entityType: ClipboardEntityType): boolean {
	const entry = getClipboard();
	return entry?.entityType === entityType;
}

/**
 * Clear the clipboard.
 */
export function clearClipboard(): void {
	if (browser) {
		localStorage.removeItem(STORAGE_KEY);
	}
}
