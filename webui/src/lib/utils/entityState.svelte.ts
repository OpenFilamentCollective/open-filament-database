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
import { submittedStore } from '$lib/stores/submitted';
import { useChangeTracking } from '$lib/stores/environment';
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
 * {#if state.hasLocalChanges}...{/if}
 * ```
 */
export function createEntityState(config: EntityStateConfig) {
	// Modal states
	let showEditModal = $state(false);
	let showCreateModal = $state(false);
	let showDuplicateModal = $state(false);
	let showPasteModal = $state(false);
	let showCloudCompareModal = $state(false);

	// Pre-filled data for duplicate/paste modals
	let duplicateData: Record<string, any> | null = $state(null);
	let pasteData: Record<string, any> | null = $state(null);

	// Operation states
	let saving = $state(false);
	let creating = $state(false);

	// Logo states
	let logoDataUrl = $state('');
	let logoChanged = $state(false);

	// Bridge Svelte 4 stores into Svelte 5 reactivity
	let changeSet = $state(get(changeStore));
	let trackingEnabled = $state(get(useChangeTracking));
	let submittedVersion = $state(0);
	// Plain counter — incrementing inside the subscribe callback must not read
	// the reactive `submittedVersion` (that would be a read-then-write inside the
	// $effect, causing Svelte to re-schedule itself infinitely).
	let submittedVersionCounter = 0;

	$effect(() => {
		const unsub = changeStore.subscribe((v) => {
			changeSet = v;
		});
		return unsub;
	});

	$effect(() => {
		const unsub = useChangeTracking.subscribe((v) => {
			trackingEnabled = v;
		});
		return unsub;
	});

	$effect(() => {
		const unsub = submittedStore.subscribe(() => {
			submittedVersion = ++submittedVersionCounter;
		});
		return unsub;
	});

	// Change detection - check if entity has local changes
	const hasLocalChanges = $derived.by(() => {
		if (!trackingEnabled) return false;
		const entity = config.getEntity();
		if (!entity) return false;

		const path = config.getEntityPath();
		if (!path) return false;

		const change = changeSet._index.get(path)?.change;
		return change !== undefined && (change.operation === 'create' || change.operation === 'update');
	});

	// Check if any descendant entity has local changes
	const hasDescendantChanges = $derived.by(() => {
		if (!trackingEnabled) return false;
		const entity = config.getEntity();
		if (!entity) return false;

		const path = config.getEntityPath();
		if (!path) return false;

		const node = changeSet._index.get(path);
		if (!node) return false;
		return treeHasDescendantChanges(node);
	});

	// The submission this entity is part of, if any — carries the PR number and URL so the
	// page can point at the review rather than just saying "submitted".
	const submittedEntry = $derived.by(() => {
		if (!trackingEnabled) return undefined;
		// Access submittedVersion to trigger reactivity on store changes
		void submittedVersion;
		const path = config.getEntityPath();
		if (!path) return undefined;
		return submittedStore.getChange(path)?.entry;
	});

	// Check if entity has submitted (pending-merge) changes
	const hasSubmittedChanges = $derived(!!submittedEntry);

	// Check if entity was locally created (for delete modal messaging)
	const isLocalCreate = $derived.by(() => {
		if (!trackingEnabled) return false;
		const path = config.getEntityPath();
		if (!path) return false;
		return changeSet._index.get(path)?.change?.operation === 'create';
	});

	return {
		// Modal getters/setters
		get showEditModal() {
			return showEditModal;
		},
		set showEditModal(v: boolean) {
			showEditModal = v;
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
		get hasSubmittedChanges() {
			return hasSubmittedChanges;
		},
		get submittedEntry() {
			return submittedEntry;
		},

		// Duplicate/Paste/Compare modal states
		get showDuplicateModal() {
			return showDuplicateModal;
		},
		set showDuplicateModal(v: boolean) {
			showDuplicateModal = v;
		},
		get showPasteModal() {
			return showPasteModal;
		},
		set showPasteModal(v: boolean) {
			showPasteModal = v;
		},
		get showCloudCompareModal() {
			return showCloudCompareModal;
		},
		set showCloudCompareModal(v: boolean) {
			showCloudCompareModal = v;
		},
		get duplicateData() {
			return duplicateData;
		},
		get pasteData() {
			return pasteData;
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
		openCreate() {
			showCreateModal = true;
		},
		closeCreate() {
			showCreateModal = false;
		},
		openDuplicate(data: Record<string, any>) {
			duplicateData = data;
			showDuplicateModal = true;
		},
		closeDuplicate() {
			showDuplicateModal = false;
			duplicateData = null;
			logoDataUrl = '';
			logoChanged = false;
		},
		openPaste(data: Record<string, any>) {
			pasteData = data;
			showPasteModal = true;
		},
		closePaste() {
			showPasteModal = false;
			pasteData = null;
			logoDataUrl = '';
			logoChanged = false;
		},
		openCloudCompare() {
			showCloudCompareModal = true;
		},
		closeCloudCompare() {
			showCloudCompareModal = false;
		}
	};
}
