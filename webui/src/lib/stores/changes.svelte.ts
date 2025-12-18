import { browser } from '$app/environment';

export type ChangeOperation = 'create' | 'update' | 'delete';

export interface Change {
	id: string;
	operation: ChangeOperation;
	path: string;
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
		return stored ? JSON.parse(stored) : [];
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

export function addChange(operation: ChangeOperation, path: string, data: Record<string, unknown>): Change {
	const change: Change = {
		id: generateId(),
		operation,
		path,
		data,
		timestamp: Date.now()
	};

	// Check if there's an existing change for this path
	const existingIndex = changes.findIndex((c) => c.path === path);

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
			changes[existingIndex] = {
				...change,
				operation: existing.operation === 'create' ? 'create' : 'update'
			};
		}
	} else {
		// Add new change
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

export function getChangeForPath(path: string): Change | undefined {
	return changes.find((c) => c.path === path);
}

export function hasChangeForPath(path: string): boolean {
	return changes.some((c) => c.path === path);
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
