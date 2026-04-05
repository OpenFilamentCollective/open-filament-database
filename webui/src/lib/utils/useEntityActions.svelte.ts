/**
 * Shared composables for entity copy/duplicate actions.
 *
 * These ensure that both detail-page dropdowns AND list-view card menus
 * go through the exact same code path, including the "with/without children"
 * options modal for entities that have children.
 */

import {
	copyEntity,
	getClipboard,
	prepareDuplicateData,
	type ClipboardEntityType
} from '$lib/services/clipboardService';

// ============================================
// Copy action (with optional children support)
// ============================================

export interface CopyAction {
	readonly showOptions: boolean;
	/** Call this to initiate a copy. Shows options modal if entity has children. */
	request: (data: Record<string, any>, path: string) => void;
	/** Called by the options modal when user picks a scope. */
	select: (scope: string) => Promise<void>;
	/** Close the options modal without copying. */
	close: () => void;
}

/**
 * Create a copy action handler for a given entity type.
 *
 * @param entityType - The type of entity being copied
 * @param loadChildrenFn - If provided, entity is treated as having children.
 *   Called with (entityData, entityPath) to load nested children for clipboard.
 *   If null/undefined, copy happens immediately without showing options.
 */
export function createCopyAction(
	entityType: ClipboardEntityType,
	loadChildrenFn?: ((data: Record<string, any>, path: string) => Promise<Record<string, any[]>>) | null
): CopyAction {
	let showOptions = $state(false);
	let pendingData: Record<string, any> | null = $state(null);
	let pendingPath = $state('');

	function request(data: Record<string, any>, path: string) {
		if (loadChildrenFn) {
			pendingData = data;
			pendingPath = path;
			showOptions = true;
		} else {
			// No children possible - copy immediately
			copyEntity(entityType, data, path);
		}
	}

	async function select(scope: string) {
		showOptions = false;
		if (!pendingData) return;
		if (scope === 'with-children' && loadChildrenFn) {
			const children = await loadChildrenFn(pendingData, pendingPath);
			await copyEntity(entityType, pendingData, pendingPath, children);
		} else {
			await copyEntity(entityType, pendingData, pendingPath);
		}
		pendingData = null;
	}

	function close() {
		showOptions = false;
		pendingData = null;
	}

	return {
		get showOptions() { return showOptions; },
		request,
		select,
		close
	};
}

// ============================================
// Duplicate action (with optional children support)
// ============================================

export interface DuplicateAction {
	readonly showOptions: boolean;
	readonly withChildren: boolean;
	/** Call this to initiate a duplicate. Shows options modal if entity has children. */
	request: (data: Record<string, any>) => void;
	/** Called by the options modal when user picks a scope. */
	select: (scope: string) => void;
	/** Close the options modal without duplicating. */
	close: () => void;
}

/**
 * Create a duplicate action handler.
 *
 * @param hasChildren - Whether this entity type has children
 * @param openFormFn - Called with prepared duplicate data to open the form
 */
export function createDuplicateAction(
	entityType: ClipboardEntityType,
	hasChildren: boolean,
	openFormFn: (data: Record<string, any>) => void
): DuplicateAction {
	let showOptions = $state(false);
	let withChildren = $state(false);
	let pendingData: Record<string, any> | null = $state(null);

	function request(data: Record<string, any>) {
		const prepared = prepareDuplicateData(entityType, data);
		if (hasChildren) {
			pendingData = prepared;
			showOptions = true;
		} else {
			withChildren = false;
			openFormFn(prepared);
		}
	}

	function select(scope: string) {
		withChildren = scope === 'with-children';
		showOptions = false;
		if (pendingData) {
			openFormFn(pendingData);
			pendingData = null;
		}
	}

	function close() {
		showOptions = false;
		pendingData = null;
	}

	return {
		get showOptions() { return showOptions; },
		get withChildren() { return withChildren; },
		request,
		select,
		close
	};
}

// ============================================
// Paste action (auto-handles children from clipboard)
// ============================================

/**
 * Build a paste handler that opens a form pre-filled with clipboard data.
 * If no name conflict exists, the name is kept as-is (no "(Copy)" suffix).
 * If there IS a conflict, "(Copy)" is appended so the user can see why and adjust.
 *
 * @param entityType - Expected clipboard entity type
 * @param openFormFn - Called with prepared paste data to open the form
 * @param hasConflict - Checks if the entity name already exists.
 *   Receives the raw clipboard data. Return true if a conflict exists.
 */
export function createPasteHandler(
	entityType: ClipboardEntityType,
	openFormFn: (data: Record<string, any>) => void,
	hasConflict?: (data: Record<string, any>) => boolean
): () => void {
	return () => {
		const entry = getClipboard();
		if (entry?.entityType === entityType) {
			// Clone without adding "(Copy)" first
			const rawClone = JSON.parse(JSON.stringify(entry.data));
			// Clear identity fields
			delete rawClone.id;
			delete rawClone.slug;
			delete rawClone.brandId;
			delete rawClone.filamentDir;
			if (entityType === 'material') {
				delete rawClone.materialType;
			}

			// Only add "(Copy)" if there's a name conflict
			if (hasConflict && hasConflict(rawClone)) {
				const nameKey = entityType === 'material' ? 'material' : 'name';
				if (rawClone[nameKey]) {
					rawClone[nameKey] = `${rawClone[nameKey]} (Copy)`;
				}
			}

			openFormFn(rawClone);
		}
	};
}
