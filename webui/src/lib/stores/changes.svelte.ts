import { browser } from '$app/environment';

export type ChangeOperation = 'create' | 'update' | 'delete';

export interface Change {
	id: string;
	operation: ChangeOperation;
	originalPath: string; // The path as it exists in the DB
	path: string; // The current path (may differ if renamed)
	data: Record<string, unknown>;
	timestamp: number;
}

const STORAGE_KEY = 'filament-db-changes';

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function loadFromStorage(): Change[] {
	if (!browser) return [];
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return [];
		const parsed = JSON.parse(stored) as Change[];
		// Migration: add originalPath if missing (for backwards compatibility)
		return parsed.map((c) => ({
			...c,
			originalPath: c.originalPath ?? c.path
		}));
	} catch {
		return [];
	}
}

function saveToStorage(changes: Change[]): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(changes));
	} catch (error) {
		console.error('Failed to save changes to localStorage:', error);
	}
}

// Svelte 5 runes-based state
let changes = $state<Change[]>(loadFromStorage());

export function getChanges(): Change[] {
	return changes;
}

export function getChangeCount(): number {
	return changes.length;
}

/**
 * Calculate the new path based on changed data
 * The naming field depends on the entity type:
 * - brand.json: uses 'brand' field
 * - material.json: uses 'material' field
 * - filament.json: uses 'name' field
 * - variant.json: uses 'color_name' field
 * - sizes.json: no renaming (stays in variant folder)
 */
function calculateNewPath(originalPath: string, data: Record<string, unknown>): string {
	const parts = originalPath.split('/');
	const filename = parts[parts.length - 1];

	if (filename === 'brand.json' && data.brand) {
		// Brand rename: change first path segment
		parts[0] = data.brand as string;
	} else if (filename === 'material.json' && data.material) {
		// Material rename: change second path segment
		parts[1] = data.material as string;
	} else if (filename === 'filament.json' && data.name) {
		// Filament rename: change third path segment
		parts[2] = data.name as string;
	} else if (filename === 'variant.json' && data.color_name) {
		// Variant rename: change fourth path segment
		parts[3] = data.color_name as string;
	}
	// sizes.json doesn't cause rename

	return parts.join('/');
}

export function addChange(
	operation: ChangeOperation,
	originalPath: string,
	data: Record<string, unknown>
): Change | null {
	const newPath = calculateNewPath(originalPath, data);

	const change: Change = {
		id: generateId(),
		operation,
		originalPath,
		path: newPath,
		data,
		timestamp: Date.now()
	};

	// Check if there's an existing change for this original path
	const existingIndex = changes.findIndex((c) => c.originalPath === originalPath);

	if (existingIndex !== -1) {
		// Update existing change
		const existing = changes[existingIndex];

		if (operation === 'delete') {
			// If we're deleting something we created, just remove the create change
			if (existing.operation === 'create') {
				changes = changes.filter((_, i) => i !== existingIndex);
				saveToStorage(changes);
				return change;
			}
			// Otherwise, mark as delete
			changes[existingIndex] = change;
		} else if (operation === 'update') {
			// Keep the original operation type if it was 'create'
			// Keep the original originalPath
			// Note: We don't auto-remove changes when path reverts to original,
			// because other data (like traits) might still be changed.
			// Users can manually discard changes if they want to undo everything.
			changes[existingIndex] = {
				...change,
				operation: existing.operation === 'create' ? 'create' : 'update',
				originalPath: existing.originalPath
			};
		}
	} else {
		// Add new change (even if path hasn't changed - data might have changed)
		changes = [...changes, change];
	}

	saveToStorage(changes);
	return change;
}

export function removeChange(id: string): void {
	changes = changes.filter((c) => c.id !== id);
	saveToStorage(changes);
}

export function clearChanges(): void {
	changes = [];
	saveToStorage(changes);
}

/**
 * Get change by original path (the path as it exists in DB)
 */
export function getChangeByOriginalPath(originalPath: string): Change | undefined {
	return changes.find((c) => c.originalPath === originalPath);
}

/**
 * Get change by current path (after potential rename)
 */
export function getChangeByPath(path: string): Change | undefined {
	return changes.find((c) => c.path === path);
}

/**
 * Check if an original path has been renamed
 */
export function getNewPathForOriginal(originalPath: string): string | undefined {
	const change = changes.find((c) => c.originalPath === originalPath && c.path !== originalPath);
	return change?.path;
}

/**
 * Check if a path is a renamed version of something else
 * Returns the original path if found
 */
export function getOriginalPathForNew(newPath: string): string | undefined {
	const change = changes.find((c) => c.path === newPath && c.originalPath !== newPath);
	return change?.originalPath;
}

/**
 * Get all renames (where path differs from originalPath)
 */
export function getRenames(): Change[] {
	return changes.filter((c) => c.path !== c.originalPath && c.operation !== 'delete');
}

// Legacy compatibility
export function getChangeForPath(path: string): Change | undefined {
	return getChangeByOriginalPath(path) ?? getChangeByPath(path);
}

export function hasChangeForPath(path: string): boolean {
	return changes.some((c) => c.originalPath === path || c.path === path);
}

// Export changes as JSON for future GitHub PR integration
export function exportChanges(): string {
	return JSON.stringify(changes, null, 2);
}

// Import changes from JSON
export function importChanges(json: string): void {
	try {
		const imported = JSON.parse(json) as Change[];
		changes = imported;
		saveToStorage(changes);
	} catch (error) {
		console.error('Failed to import changes:', error);
	}
}

/**
 * Format a change into a human-readable description
 */
export function formatChangeDescription(change: Change): string {
	const path = change.path;
	const parts = path.split('/');
	const filename = parts[parts.length - 1];

	// Store: stores/{storeId}/store.json
	if (parts[0] === 'stores' && filename === 'store.json') {
		const name = (change.data as Record<string, unknown>)?.name as string || parts[1];
		return name;
	}

	// Brand: {brand}/brand.json
	if (filename === 'brand.json' && parts.length === 2) {
		const name = (change.data as Record<string, unknown>)?.brand as string || parts[0];
		return name;
	}

	// Material: {brand}/{material}/material.json
	if (filename === 'material.json' && parts.length === 3) {
		const name = (change.data as Record<string, unknown>)?.material as string || parts[1];
		const brand = parts[0];
		return `${name} material in ${brand}`;
	}

	// Filament: {brand}/{material}/{filament}/filament.json
	if (filename === 'filament.json' && parts.length === 4) {
		const name = (change.data as Record<string, unknown>)?.name as string || parts[2];
		const parent = `${parts[0]}/${parts[1]}`;
		return `${name} filament in ${parent}`;
	}

	// Variant: {brand}/{material}/{filament}/{variant}/variant.json
	if (filename === 'variant.json' && parts.length === 5) {
		const name = (change.data as Record<string, unknown>)?.color_name as string || parts[3];
		const parent = `${parts[0]}/${parts[1]}/${parts[2]}`;
		return `${name} variant in ${parent}`;
	}

	// Sizes: {brand}/{material}/{filament}/{variant}/sizes.json
	if (filename === 'sizes.json' && parts.length === 5) {
		const variant = parts[3];
		const parent = `${parts[0]}/${parts[1]}/${parts[2]}`;
		return `Sizes for ${variant} in ${parent}`;
	}

	// Fallback to path
	return path;
}
