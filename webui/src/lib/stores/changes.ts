import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type {
	EntityChange,
	EntityIdentifier,
	PropertyChange,
	ChangeOperation,
	ChangeExport
} from '$lib/types/changes';
import type { TreeChangeSet } from '$lib/types/changeTree';
import { parsePath } from '$lib/utils/changePaths';
import {
	createEmptyChangeSet,
	serialize,
	deserialize,
	getChange as treeGetChange,
	setChange as treeSetChange,
	removeChange as treeRemoveChange,
	removeDescendants,
	moveSubtree,
	getAllChanges,
	countChanges,
	findImagesForEntity,
	moveImageReferences,
	hasDescendantChanges as treeHasDescendantChanges,
	getDirectChildren
} from '$lib/utils/changeTreeOps';
import { useChangeTracking } from './environment';

const STORAGE_KEY_CHANGES = 'ofd_pending_changes';
const STORAGE_KEY_IMAGES_PREFIX = 'ofd_image_';

/**
 * Calculate a user-friendly description for a change
 */
function describeChange(entity: EntityIdentifier, operation: ChangeOperation, data?: any): string {
	// For materials, use the 'material' field (e.g., "PLA"); for variants/brands/filaments use 'name'
	// Fall back to 'id', then entity.id
	const entityName = data?.name || data?.material || data?.id || entity.id;

	switch (operation) {
		case 'create':
			return `Created ${entity.type} "${entityName}"`;
		case 'delete':
			return `Deleted ${entity.type} "${entityName}"`;
		case 'update':
			return `Updated ${entity.type} "${entityName}"`;
		default:
			return `Modified ${entity.type} "${entityName}"`;
	}
}

/**
 * Check if two values are effectively equal (handles undefined/null/empty equivalence)
 */
function areValuesEqual(oldValue: any, newValue: any): boolean {
	// Handle undefined/null equivalence
	const oldEmpty = oldValue === undefined || oldValue === null || oldValue === '';
	const newEmpty = newValue === undefined || newValue === null || newValue === '';
	if (oldEmpty && newEmpty) return true;

	// Handle empty array vs undefined/null
	if (Array.isArray(oldValue) && oldValue.length === 0 && newEmpty) return true;
	if (Array.isArray(newValue) && newValue.length === 0 && oldEmpty) return true;

	// Handle empty object vs undefined/null (e.g. {} from form vs undefined from original)
	const isEmptyObj = (v: any) =>
		typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0;
	if (isEmptyObj(oldValue) && newEmpty) return true;
	if (isEmptyObj(newValue) && oldEmpty) return true;

	// Deep comparison using JSON
	return JSON.stringify(oldValue) === JSON.stringify(newValue);
}

/**
 * Deep comparison to find changed properties
 */
function findChangedProperties(oldObj: any, newObj: any, prefix = ''): PropertyChange[] {
	const changes: PropertyChange[] = [];

	// Fields to skip (internal identifiers, separately tracked fields, and related data)
	const skipFields = new Set([
		'id', 'slug', 'logo', 'logo_name', 'logo_slug',
		// Context fields added when loading data (not part of the actual stored entity)
		'brandId', 'brand_id', 'materialType', 'filament_id',
		// Related data that's loaded separately, not part of the entity itself
		'materials', 'filaments', 'variants'
	]);

	// Get all unique keys from both objects
	const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

	for (const key of allKeys) {
		// Skip internal identifier fields at root level
		if (!prefix && skipFields.has(key)) {
			continue;
		}

		const propertyPath = prefix ? `${prefix}.${key}` : key;

		// Check if key exists in each object (vs just being undefined)
		const oldHasKey = oldObj && key in oldObj;
		const newHasKey = newObj && key in newObj;
		const oldValue = oldHasKey ? oldObj[key] : undefined;
		const newValue = newHasKey ? newObj[key] : undefined;

		// Skip if values are effectively equal (including missing vs null vs empty string)
		if (areValuesEqual(oldValue, newValue)) {
			continue;
		}

		// If both are objects (and not arrays), recurse
		if (
			oldValue &&
			newValue &&
			typeof oldValue === 'object' &&
			typeof newValue === 'object' &&
			!Array.isArray(oldValue) &&
			!Array.isArray(newValue)
		) {
			changes.push(...findChangedProperties(oldValue, newValue, propertyPath));
		} else {
			// Value changed
			changes.push({
				property: propertyPath,
				oldValue,
				newValue,
				timestamp: Date.now()
			});
		}
	}

	return changes;
}

/**
 * Create the change tracking store (tree-based, v2)
 */
function createChangeStore() {
	const initialChangeSet: TreeChangeSet = createEmptyChangeSet();

	const { subscribe, set, update } = writable<TreeChangeSet>(initialChangeSet);

	// Load from localStorage on initialization
	if (browser) {
		try {
			const stored = localStorage.getItem(STORAGE_KEY_CHANGES);
			if (stored) {
				const parsed = JSON.parse(stored);

				if (parsed.version === 2) {
					set(deserialize(parsed));
				}
				// Old format data is simply discarded
			}
		} catch (e) {
			console.error('Failed to load changes from localStorage:', e);
		}
	}

	/**
	 * Persist changes to localStorage
	 */
	function persistChangeSet(changeSet: TreeChangeSet) {
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY_CHANGES, JSON.stringify(serialize(changeSet)));
			} catch (e) {
				console.error('Failed to persist changes to localStorage:', e);
			}
		}
	}

	/**
	 * Remove images associated with an entity path from localStorage and the changeSet
	 */
	function cleanupImages(changeSet: TreeChangeSet, entityPath: string) {
		if (!browser) return;

		const imageIds = findImagesForEntity(changeSet.images, entityPath);
		for (const imageId of imageIds) {
			const imageRef = changeSet.images[imageId];
			if (imageRef) {
				try {
					localStorage.removeItem(imageRef.storageKey);
				} catch (e) {
					console.error('Failed to remove image during entity cleanup:', e);
				}
				delete changeSet.images[imageId];
			}
		}
	}

	return {
		subscribe,

		/**
		 * Track a new entity creation
		 */
		trackCreate(entity: EntityIdentifier, data: any) {
			if (!get(useChangeTracking)) return;

			const ep = parsePath(entity.path);
			if (!ep) return;

			update((changeSet) => {
				treeSetChange(changeSet, ep, {
					entity,
					operation: 'create',
					data,
					timestamp: Date.now(),
					description: describeChange(entity, 'create', data)
				});
				changeSet.lastModified = Date.now();
				persistChangeSet(changeSet);
				return changeSet;
			});
		},

		/**
		 * Track an entity update
		 */
		trackUpdate(entity: EntityIdentifier, oldData: any, newData: any) {
			if (!get(useChangeTracking)) return;

			const ep = parsePath(entity.path);
			if (!ep) return;

			update((changeSet) => {
				const existingChange = treeGetChange(changeSet, entity.path);

				if (existingChange?.operation === 'create') {
					// If this entity was created in this session, just update the creation data
					treeSetChange(changeSet, ep, {
						...existingChange,
						data: newData,
						timestamp: Date.now(),
						description: describeChange(entity, 'create', newData)
					});
					changeSet.lastModified = Date.now();
					persistChangeSet(changeSet);
					return changeSet;
				}

				// For updates, use the original data from existing change or the provided oldData
				const originalData = existingChange?.originalData ?? oldData;

				// Compare against the original data to see if there are still changes
				const propertyChanges = findChangedProperties(originalData, newData);

				if (propertyChanges.length === 0) {
					// All changes have been reverted - remove the change entry
					treeRemoveChange(changeSet, ep);
					changeSet.lastModified = Date.now();
					persistChangeSet(changeSet);
					return changeSet;
				}

				// Track as an update, preserving the original data
				treeSetChange(changeSet, ep, {
					entity,
					operation: 'update',
					data: newData,
					originalData,
					propertyChanges,
					timestamp: Date.now(),
					description: describeChange(entity, 'update', newData)
				});

				changeSet.lastModified = Date.now();
				persistChangeSet(changeSet);
				return changeSet;
			});
		},

		/**
		 * Track an entity deletion
		 */
		trackDelete(entity: EntityIdentifier, data?: any) {
			if (!get(useChangeTracking)) return;

			const ep = parsePath(entity.path);
			if (!ep) return;

			update((changeSet) => {
				const existingChange = treeGetChange(changeSet, entity.path);

				// Clean up images for this entity and descendants
				cleanupImages(changeSet, entity.path);

				// Remove all descendant changes (tree operation replaces O(n) prefix scan)
				const removedDescendants = removeDescendants(changeSet, ep);
				// Also clean up images for each removed descendant
				for (const desc of removedDescendants) {
					cleanupImages(changeSet, desc.entity.path);
				}

				if (existingChange?.operation === 'create') {
					// If this entity was created in this session, just remove it
					treeRemoveChange(changeSet, ep);
				} else {
					// Track as a deletion
					treeSetChange(changeSet, ep, {
						entity,
						operation: 'delete',
						timestamp: Date.now(),
						description: describeChange(entity, 'delete', data)
					});
				}

				changeSet.lastModified = Date.now();
				persistChangeSet(changeSet);
				return changeSet;
			});
		},

		/**
		 * Store an image reference
		 */
		storeImage(
			imageId: string,
			entityPath: string,
			property: string,
			filename: string,
			mimeType: string,
			base64Data: string
		) {
			if (!get(useChangeTracking)) return;

			const storageKey = `${STORAGE_KEY_IMAGES_PREFIX}${imageId}`;

			// Store the image data separately
			if (browser) {
				try {
					localStorage.setItem(storageKey, base64Data);
				} catch (e) {
					console.error('Failed to store image:', e);
					throw new Error('Failed to store image. Storage quota may be exceeded.');
				}
			}

			update((changeSet) => {
				changeSet.images[imageId] = {
					id: imageId,
					entityPath,
					property,
					filename,
					mimeType,
					storageKey
				};
				changeSet.lastModified = Date.now();
				persistChangeSet(changeSet);
				return changeSet;
			});
		},

		/**
		 * Get an image by ID
		 */
		getImage(imageId: string): string | null {
			if (!browser) return null;

			const changeSet = get({ subscribe });
			const imageRef = changeSet.images[imageId];

			if (!imageRef) return null;

			try {
				return localStorage.getItem(imageRef.storageKey);
			} catch (e) {
				console.error('Failed to retrieve image:', e);
				return null;
			}
		},

		/**
		 * Remove a specific change and its descendants
		 */
		removeChange(entityPath: string) {
			const ep = parsePath(entityPath);
			if (!ep) return;

			update((changeSet) => {
				// Clean up images for this entity and descendants
				cleanupImages(changeSet, entityPath);
				const removedDescendants = removeDescendants(changeSet, ep);
				for (const desc of removedDescendants) {
					cleanupImages(changeSet, desc.entity.path);
				}

				// Remove the change itself
				treeRemoveChange(changeSet, ep);
				changeSet.lastModified = Date.now();
				persistChangeSet(changeSet);
				return changeSet;
			});
		},

		/**
		 * Move a change from one path to another (for entity renames)
		 * Also moves all child entities under the old path
		 * Returns the new path
		 */
		moveChange(oldPath: string, newPath: string, newEntity: EntityIdentifier): string {
			if (!get(useChangeTracking)) return newPath;
			if (oldPath === newPath) return newPath;

			const oldEp = parsePath(oldPath);
			const newEp = parsePath(newPath);
			if (!oldEp || !newEp) return newPath;

			update((changeSet) => {
				// Move the subtree in the tree structure
				moveSubtree(changeSet, oldEp, newEp, newEntity);

				// Also update image references
				moveImageReferences(changeSet.images, oldPath, newPath);

				changeSet.lastModified = Date.now();
				persistChangeSet(changeSet);
				return changeSet;
			});

			return newPath;
		},

		/**
		 * Clear all changes
		 */
		clear() {
			if (!browser) return;

			// Clear all image data from localStorage
			const changeSet = get({ subscribe });
			for (const imageRef of Object.values(changeSet.images)) {
				try {
					localStorage.removeItem(imageRef.storageKey);
				} catch (e) {
					console.error('Failed to remove image:', e);
				}
			}

			// Clear the change set
			set(createEmptyChangeSet());
			localStorage.removeItem(STORAGE_KEY_CHANGES);
		},

		/**
		 * Export all changes as JSON
		 */
		exportChanges(): ChangeExport {
			const changeSet = get({ subscribe });
			const changes = getAllChanges(changeSet.tree);

			// Build image export with embedded base64 data
			const images: ChangeExport['images'] = {};

			for (const [imageId, imageRef] of Object.entries(changeSet.images)) {
				const data = browser ? localStorage.getItem(imageRef.storageKey) : null;

				if (data) {
					images[imageId] = {
						filename: imageRef.filename,
						mimeType: imageRef.mimeType,
						data
					};
				}
			}

			return {
				metadata: {
					exportedAt: Date.now(),
					version: '1.0.0',
					changeCount: changes.length,
					imageCount: Object.keys(images).length
				},
				changes,
				images
			};
		},

		/**
		 * Get a summary of changes by operation type
		 */
		getSummary() {
			const changeSet = get({ subscribe });
			const changes = getAllChanges(changeSet.tree);

			const summary = {
				total: changes.length,
				creates: changes.filter((c) => c.operation === 'create').length,
				updates: changes.filter((c) => c.operation === 'update').length,
				deletes: changes.filter((c) => c.operation === 'delete').length,
				images: Object.keys(changeSet.images).length
			};

			return summary;
		}
	};
}

export const changeStore = createChangeStore();

// Derived stores for convenient access
export const changeCount = derived(changeStore, ($store) => countChanges($store.tree));

export const hasChanges = derived(changeCount, ($count) => $count > 0);

export const changesList = derived(changeStore, ($store) =>
	getAllChanges($store.tree).sort((a, b) => b.timestamp - a.timestamp)
);

/**
 * Derived store for O(1) path-based change lookups.
 * Replaces `$changeStore.changes[path]` with `$changes.get(path)`.
 */
export const changes = derived(changeStore, ($store) => ({
	get(path: string): EntityChange | undefined {
		return $store._index.get(path)?.change;
	},
	has(path: string): boolean {
		const node = $store._index.get(path);
		return node?.change !== undefined;
	},
	hasDescendantChanges(path: string): boolean {
		const node = $store._index.get(path);
		if (!node) return false;
		return treeHasDescendantChanges(node);
	},
	getChildChanges(parentPath: string, namespace: string): Array<{ id: string; change: EntityChange }> {
		const ep = parsePath(parentPath);
		if (!ep) return [];
		return getDirectChildren($store.tree, ep, namespace)
			.filter((n) => n.change)
			.map((n) => ({ id: n.key, change: n.change! }));
	},
	getRootChanges(namespace: 'brands' | 'stores'): Array<{ id: string; change: EntityChange }> {
		const nodes = $store.tree[namespace];
		return Object.values(nodes)
			.filter((n) => n.change)
			.map((n) => ({ id: n.key, change: n.change! }));
	}
}));
