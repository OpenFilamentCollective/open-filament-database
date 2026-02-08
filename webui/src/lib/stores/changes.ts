import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type {
	EntityChange,
	ChangeSet,
	EntityIdentifier,
	PropertyChange,
	ChangeOperation,
	ChangeExport
} from '$lib/types/changes';
import { isCloudMode } from './environment';

const STORAGE_KEY_CHANGES = 'ofd_pending_changes';
const STORAGE_KEY_IMAGES_PREFIX = 'ofd_image_';

/**
 * Calculate a user-friendly description for a change
 */
function describeChange(entity: EntityIdentifier, operation: ChangeOperation, data?: any): string {
	// For materials, use the 'material' field (e.g., "PLA"); for variants use 'color_name'
	// Fall back to 'name', then 'id', then entity.id
	const entityName = data?.name || data?.material || data?.color_name || data?.id || entity.id;

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
 * Create the change tracking store
 */
function createChangeStore() {
	const initialChangeSet: ChangeSet = {
		changes: {},
		images: {},
		lastModified: Date.now()
	};

	const { subscribe, set, update } = writable<ChangeSet>(initialChangeSet);

	// Load from localStorage on initialization
	if (browser) {
		try {
			const stored = localStorage.getItem(STORAGE_KEY_CHANGES);
			if (stored) {
				const parsed = JSON.parse(stored);
				set(parsed);
			}
		} catch (e) {
			console.error('Failed to load changes from localStorage:', e);
		}
	}

	/**
	 * Persist changes to localStorage
	 */
	function persist(changeSet: ChangeSet) {
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY_CHANGES, JSON.stringify(changeSet));
			} catch (e) {
				console.error('Failed to persist changes to localStorage:', e);
			}
		}
	}

	/**
	 * Remove all child entity changes (and their images) for a given parent path.
	 * E.g., deleting "brands/acme" removes changes for "brands/acme/materials/PLA/filaments/..." etc.
	 */
	function cleanupChildChanges(changeSet: ChangeSet, entityPath: string) {
		const pathPrefix = entityPath + '/';

		for (const childPath of Object.keys(changeSet.changes)) {
			if (childPath.startsWith(pathPrefix)) {
				cleanupImagesForEntity(changeSet, childPath);
				delete changeSet.changes[childPath];
			}
		}
	}

	/**
	 * Remove all images associated with an entity path (and child paths) from localStorage and the changeSet
	 */
	function cleanupImagesForEntity(changeSet: ChangeSet, entityPath: string) {
		if (!browser) return;

		const pathPrefix = entityPath + '/';

		for (const [imageId, imageRef] of Object.entries(changeSet.images)) {
			if (imageRef.entityPath === entityPath || imageRef.entityPath.startsWith(pathPrefix)) {
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
			if (!get(isCloudMode)) return;

			update((changeSet) => {
				changeSet.changes[entity.path] = {
					entity,
					operation: 'create',
					data,
					timestamp: Date.now(),
					description: describeChange(entity, 'create', data)
				};
				changeSet.lastModified = Date.now();
				persist(changeSet);
				return changeSet;
			});
		},

		/**
		 * Track an entity update
		 */
		trackUpdate(entity: EntityIdentifier, oldData: any, newData: any) {
			if (!get(isCloudMode)) return;

			update((changeSet) => {
				const existingChange = changeSet.changes[entity.path];

				if (existingChange?.operation === 'create') {
					// If this entity was created in this session, just update the creation data
					changeSet.changes[entity.path] = {
						...existingChange,
						data: newData,
						timestamp: Date.now(),
						description: describeChange(entity, 'create', newData)
					};
					changeSet.lastModified = Date.now();
					persist(changeSet);
					return changeSet;
				}

				// For updates, use the original data from existing change or the provided oldData
				const originalData = existingChange?.originalData ?? oldData;

				// Compare against the original data to see if there are still changes
				const propertyChanges = findChangedProperties(originalData, newData);

				if (propertyChanges.length === 0) {
					// All changes have been reverted - remove the change entry
					delete changeSet.changes[entity.path];
					changeSet.lastModified = Date.now();
					persist(changeSet);
					return changeSet;
				}

				// Track as an update, preserving the original data
				changeSet.changes[entity.path] = {
					entity,
					operation: 'update',
					data: newData,
					originalData,
					propertyChanges,
					timestamp: Date.now(),
					description: describeChange(entity, 'update', newData)
				};

				changeSet.lastModified = Date.now();
				persist(changeSet);
				return changeSet;
			});
		},

		/**
		 * Track an entity deletion
		 */
		trackDelete(entity: EntityIdentifier, data?: any) {
			if (!get(isCloudMode)) return;

			update((changeSet) => {
				const existingChange = changeSet.changes[entity.path];

				// Clean up any images and child entity changes
				cleanupImagesForEntity(changeSet, entity.path);
				cleanupChildChanges(changeSet, entity.path);

				if (existingChange?.operation === 'create') {
					// If this entity was created in this session, just remove it
					delete changeSet.changes[entity.path];
				} else {
					// Track as a deletion
					changeSet.changes[entity.path] = {
						entity,
						operation: 'delete',
						timestamp: Date.now(),
						description: describeChange(entity, 'delete', data)
					};
				}

				changeSet.lastModified = Date.now();
				persist(changeSet);
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
			if (!get(isCloudMode)) return;

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
				persist(changeSet);
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
		 * Remove a specific change
		 */
		removeChange(entityPath: string) {
			update((changeSet) => {
				// Clean up any images and child entity changes
				cleanupImagesForEntity(changeSet, entityPath);
				cleanupChildChanges(changeSet, entityPath);

				delete changeSet.changes[entityPath];
				changeSet.lastModified = Date.now();
				persist(changeSet);
				return changeSet;
			});
		},

		/**
		 * Move a change from one path to another (for entity renames)
		 * Also moves all child entities under the old path
		 * Returns the new path
		 */
		moveChange(oldPath: string, newPath: string, newEntity: EntityIdentifier): string {
			if (!get(isCloudMode)) return newPath;
			if (oldPath === newPath) return newPath;

			update((changeSet) => {
				const existingChange = changeSet.changes[oldPath];
				if (!existingChange) return changeSet;

				// Move the main entity to the new path
				changeSet.changes[newPath] = {
					...existingChange,
					entity: newEntity
				};
				delete changeSet.changes[oldPath];

				// Move all child entities (paths that start with oldPath + "/")
				const oldPrefix = oldPath + '/';
				const newPrefix = newPath + '/';
				const childPaths = Object.keys(changeSet.changes).filter(p => p.startsWith(oldPrefix));

				for (const childPath of childPaths) {
					const newChildPath = newPrefix + childPath.slice(oldPrefix.length);
					const childChange = changeSet.changes[childPath];

					// Update the entity path in the child change
					changeSet.changes[newChildPath] = {
						...childChange,
						entity: {
							...childChange.entity,
							path: newChildPath
						}
					};
					delete changeSet.changes[childPath];
				}

				// Also update image references that point to the old path
				for (const [imageId, imageRef] of Object.entries(changeSet.images)) {
					if (imageRef.entityPath === oldPath) {
						changeSet.images[imageId] = {
							...imageRef,
							entityPath: newPath
						};
					} else if (imageRef.entityPath.startsWith(oldPrefix)) {
						changeSet.images[imageId] = {
							...imageRef,
							entityPath: newPrefix + imageRef.entityPath.slice(oldPrefix.length)
						};
					}
				}

				changeSet.lastModified = Date.now();
				persist(changeSet);
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
			set(initialChangeSet);
			localStorage.removeItem(STORAGE_KEY_CHANGES);
		},

		/**
		 * Export all changes as JSON
		 */
		exportChanges(): ChangeExport {
			const changeSet = get({ subscribe });
			const changes = Object.values(changeSet.changes);

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
			const changes = Object.values(changeSet.changes);

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
export const changeCount = derived(changeStore, ($store) => Object.keys($store.changes).length);

export const hasChanges = derived(changeCount, ($count) => $count > 0);

export const changesList = derived(changeStore, ($store) =>
	Object.values($store.changes).sort((a, b) => b.timestamp - a.timestamp)
);
