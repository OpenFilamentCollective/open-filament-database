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

/**
 * Prepare entity data for duplication by modifying the name and clearing identity fields.
 */
export function prepareDuplicateData(
	entityType: ClipboardEntityType,
	data: Record<string, any>
): Record<string, any> {
	const clone = JSON.parse(JSON.stringify(data));

	// Clear identity fields
	delete clone.id;
	delete clone.slug;

	// Clear cloud-only fields
	delete clone.brandId;
	delete clone.filamentDir;

	switch (entityType) {
		case 'brand':
			clone.name = `${data.name} (Copy)`;
			// Keep logo so the duplicate form shows the existing logo
			break;
		case 'material':
			clone.material = `${data.material} (Copy)`;
			delete clone.materialType;
			break;
		case 'filament':
			clone.name = `${data.name} (Copy)`;
			break;
		case 'variant':
			clone.name = `${data.name} (Copy)`;
			break;
		case 'store':
			clone.name = `${data.name} (Copy)`;
			// Keep logo so the duplicate form shows the existing logo
			break;
	}

	return clone;
}
