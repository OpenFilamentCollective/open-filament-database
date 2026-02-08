/**
 * Entity State Composable
 *
 * Provides unified state management for entity detail pages.
 * Consolidates modal states, operation states, logo handling, and change detection.
 *
 * Uses Svelte 5 runes for reactivity.
 */

import { get } from 'svelte/store';
import { changeStore } from '$lib/stores/changes';
import { isCloudMode } from '$lib/stores/environment';
import { hasDescendantChanges as treeHasDescendantChanges } from '$lib/utils/changeTreeOps';

export interface EntityStateConfig {
	/** Function returning the entity path for change detection */
	getEntityPath: () => string | null;
	/** Function returning the entity (for null checks) */
	getEntity: () => unknown;
}

/**
 * Create entity state management for a detail page
 *
 * @example
 * ```typescript
 * const state = createEntityState({
 *   getEntityPath: () => brand ? `brands/${brand.id}` : null,
 *   getEntity: () => brand,
 * });
 *
 * // Use in template
 * <Modal show={state.showEditModal} onClose={state.closeEdit}>
 * <button onclick={state.openDelete}>Delete</button>
 * {#if state.hasLocalChanges}...{/if}
 * ```
 */
export function createEntityState(config: EntityStateConfig) {
	// Modal states
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);
	let showCreateModal = $state(false);

	// Operation states
	let saving = $state(false);
	let deleting = $state(false);
	let creating = $state(false);

	// Logo states
	let logoDataUrl = $state('');
	let logoChanged = $state(false);

	// Change detection - check if entity has local changes
	const hasLocalChanges = $derived.by(() => {
		if (!get(isCloudMode)) return false;
		const entity = config.getEntity();
		if (!entity) return false;

		const path = config.getEntityPath();
		if (!path) return false;

		const change = get(changeStore)._index.get(path)?.change;
		return change !== undefined && (change.operation === 'create' || change.operation === 'update');
	});

	// Check if any descendant entity has local changes
	const hasDescendantChanges = $derived.by(() => {
		if (!get(isCloudMode)) return false;
		const entity = config.getEntity();
		if (!entity) return false;

		const path = config.getEntityPath();
		if (!path) return false;

		const node = get(changeStore)._index.get(path);
		if (!node) return false;
		return treeHasDescendantChanges(node);
	});

	// Check if entity was locally created (for delete modal messaging)
	const isLocalCreate = $derived.by(() => {
		if (!get(isCloudMode)) return false;
		const path = config.getEntityPath();
		if (!path) return false;
		return get(changeStore)._index.get(path)?.change?.operation === 'create';
	});

	return {
		// Modal getters/setters
		get showEditModal() {
			return showEditModal;
		},
		set showEditModal(v: boolean) {
			showEditModal = v;
		},
		get showDeleteModal() {
			return showDeleteModal;
		},
		set showDeleteModal(v: boolean) {
			showDeleteModal = v;
		},
		get showCreateModal() {
			return showCreateModal;
		},
		set showCreateModal(v: boolean) {
			showCreateModal = v;
		},

		// Operation states
		get saving() {
			return saving;
		},
		set saving(v: boolean) {
			saving = v;
		},
		get deleting() {
			return deleting;
		},
		set deleting(v: boolean) {
			deleting = v;
		},
		get creating() {
			return creating;
		},
		set creating(v: boolean) {
			creating = v;
		},

		// Logo state
		get logoDataUrl() {
			return logoDataUrl;
		},
		get logoChanged() {
			return logoChanged;
		},
		handleLogoChange(dataUrl: string) {
			logoDataUrl = dataUrl;
			logoChanged = true;
		},
		resetLogo() {
			logoDataUrl = '';
			logoChanged = false;
		},

		// Derived values
		get hasLocalChanges() {
			return hasLocalChanges;
		},
		get isLocalCreate() {
			return isLocalCreate;
		},
		get hasDescendantChanges() {
			return hasDescendantChanges;
		},

		// Modal helpers
		openEdit() {
			showEditModal = true;
		},
		closeEdit() {
			showEditModal = false;
			logoDataUrl = '';
			logoChanged = false;
		},
		openDelete() {
			showDeleteModal = true;
		},
		closeDelete() {
			showDeleteModal = false;
		},
		openCreate() {
			showCreateModal = true;
		},
		closeCreate() {
			showCreateModal = false;
		}
	};
}
