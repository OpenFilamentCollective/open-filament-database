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
	const entityName = data?.name || data?.id || entity.id;

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
 * Deep comparison to find changed properties
 */
function findChangedProperties(oldObj: any, newObj: any, prefix = ''): PropertyChange[] {
	const changes: PropertyChange[] = [];

	// Get all unique keys from both objects
	const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

	for (const key of allKeys) {
		const propertyPath = prefix ? `${prefix}.${key}` : key;
		const oldValue = oldObj?.[key];
		const newValue = newObj?.[key];

		// Skip if values are identical
		if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
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

			const propertyChanges = findChangedProperties(oldData, newData);

			if (propertyChanges.length === 0) {
				// No actual changes
				return;
			}

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
				} else {
					// Track as an update
					changeSet.changes[entity.path] = {
						entity,
						operation: 'update',
						data: newData,
						propertyChanges,
						timestamp: Date.now(),
						description: describeChange(entity, 'update', newData)
					};
				}

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
				delete changeSet.changes[entityPath];
				changeSet.lastModified = Date.now();
				persist(changeSet);
				return changeSet;
			});
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
