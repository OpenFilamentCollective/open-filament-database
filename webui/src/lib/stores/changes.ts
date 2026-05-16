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
import * as imageDb from '$lib/services/imageDb';
import { STORAGE_KEY_CHANGES, STORAGE_KEY_IMAGES_PREFIX } from '$lib/config/storageKeys';

/**
 * Schema-driven data filtering.
 *
 * Each entity schema defines its allowed properties (with additionalProperties: false).
 * We cache the set of allowed keys per entity type so we can strip any fields that
 * don't belong in the schema — cloud API relational fields, routing params, embedded
 * child collections, etc. — without maintaining a hardcoded deny-list.
 *
 * Supplementary file fields (e.g. "sizes" for variants) are stored alongside the
 * entity in the change tree but live in their own schema/file on disk, so they're
 * added as extra allowed keys per entity type.
 */
import { fetchEntitySchema, type SchemaName } from '$lib/services/schemaService';
import type { EntityType } from '$lib/types/changes';

/** Extra keys that aren't in the entity schema but are tracked in the change tree.
 *  These map to supplementary files that are stored separately on disk. */
const SUPPLEMENTARY_KEYS: Partial<Record<EntityType, string[]>> = {
	variant: ['sizes'],
	material: ['id', 'materialType']
};

/** Cached sets of allowed property keys per entity type */
const allowedKeysCache = new Map<EntityType, Set<string>>();

/** Extract allowed property keys from a JSON schema object */
function extractSchemaKeys(schema: any): Set<string> | null {
	if (!schema?.properties || typeof schema.properties !== 'object') return null;
	return new Set(Object.keys(schema.properties));
}

/** Pre-warm the allowed-keys cache for all entity types.
 *  Called once on store init (browser only). */
async function warmSchemaCache(): Promise<void> {
	const types: EntityType[] = ['brand', 'store', 'material', 'filament', 'variant'];
	await Promise.all(
		types.map(async (type) => {
			try {
				const schema = await fetchEntitySchema(type as SchemaName);
				const keys = extractSchemaKeys(schema);
				if (keys) {
					const extras = SUPPLEMENTARY_KEYS[type];
					if (extras) extras.forEach((k) => keys.add(k));
					allowedKeysCache.set(type, keys);
				}
			} catch {
				// Schema not available yet — filtering will be skipped for this type
			}
		})
	);
}

/** Load allowed keys for a single entity type (async, for use in export). */
async function getAllowedKeys(entityType: EntityType): Promise<Set<string> | undefined> {
	if (allowedKeysCache.has(entityType)) return allowedKeysCache.get(entityType);
	try {
		const schema = await fetchEntitySchema(entityType as SchemaName);
		const keys = extractSchemaKeys(schema);
		if (keys) {
			const extras = SUPPLEMENTARY_KEYS[entityType];
			if (extras) extras.forEach((k) => keys.add(k));
			allowedKeysCache.set(entityType, keys);
			return keys;
		}
	} catch { /* schema unavailable */ }
	return undefined;
}

/**
 * Strip fields not present in the entity's schema.
 * If the schema hasn't been loaded yet, returns data as-is (best-effort).
 */
function filterToSchema(data: any, entityType: EntityType): any {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
	const allowed = allowedKeysCache.get(entityType);
	if (!allowed) return data;
	const result: Record<string, any> = {};
	for (const key of Object.keys(data)) {
		if (allowed.has(key)) {
			result[key] = data[key];
		}
	}
	return result;
}

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
 * Recursively sort object keys so structurally-equivalent values produce
 * identical JSON strings regardless of insertion order. Forms re-emit object
 * literals with their own field order; without canonicalization, a rename-only
 * edit looks like a sizes/object diff just because keys moved.
 */
function canonicalize(value: any): any {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === 'object') {
		const sorted: Record<string, any> = {};
		for (const k of Object.keys(value).sort()) sorted[k] = canonicalize(value[k]);
		return sorted;
	}
	return value;
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

	// Deep comparison using canonical (key-sorted) JSON so field ordering doesn't matter.
	return JSON.stringify(canonicalize(oldValue)) === JSON.stringify(canonicalize(newValue));
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

		// Pre-warm the schema cache so synchronous track* calls can filter data
		warmSchemaCache();
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
	 * Remove images associated with an entity path from IndexedDB and the changeSet.
	 * The IndexedDB deletions are fire-and-forget so this can be called inside
	 * synchronous store update() callbacks.
	 */
	function cleanupImages(changeSet: TreeChangeSet, entityPath: string) {
		if (!browser) return;

		const imageIds = findImagesForEntity(changeSet.images, entityPath);
		const keysToRemove: string[] = [];

		for (const imageId of imageIds) {
			const imageRef = changeSet.images[imageId];
			if (imageRef) {
				keysToRemove.push(imageRef.storageKey);
				delete changeSet.images[imageId];
			}
		}

		if (keysToRemove.length > 0) {
			imageDb.removeImages(keysToRemove).catch((e) => {
				console.error('Failed to remove images during entity cleanup:', e);
			});
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

			const cleanData = filterToSchema(data, entity.type);

			update((changeSet) => {
				treeSetChange(changeSet, ep, {
					entity,
					operation: 'create',
					data: cleanData,
					timestamp: Date.now(),
					description: describeChange(entity, 'create', cleanData)
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

			const cleanNewData = filterToSchema(newData, entity.type);

			update((changeSet) => {
				const existingChange = treeGetChange(changeSet, entity.path);

				if (existingChange?.operation === 'create') {
					// If this entity was created in this session, just update the creation data
					treeSetChange(changeSet, ep, {
						...existingChange,
						data: cleanNewData,
						timestamp: Date.now(),
						description: describeChange(entity, 'create', cleanNewData)
					});
					changeSet.lastModified = Date.now();
					persistChangeSet(changeSet);
					return changeSet;
				}

				// For updates, use the original data from existing change or the provided oldData
				const originalData = existingChange?.originalData ?? filterToSchema(oldData, entity.type);

				// Compare against the original data to see if there are still changes
				const propertyChanges = findChangedProperties(originalData, cleanNewData);

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
					data: cleanNewData,
					originalData,
					propertyChanges,
					timestamp: Date.now(),
					description: describeChange(entity, 'update', cleanNewData)
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
		 * Store an image reference (image data goes to IndexedDB)
		 */
		async storeImage(
			imageId: string,
			entityPath: string,
			property: string,
			filename: string,
			mimeType: string,
			base64Data: string
		) {
			if (!get(useChangeTracking)) return;

			const storageKey = `${STORAGE_KEY_IMAGES_PREFIX}${imageId}`;

			if (browser) {
				await imageDb.setImage(storageKey, base64Data);
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
		 * Get an image by ID (reads from IndexedDB)
		 */
		async getImage(imageId: string): Promise<string | null> {
			if (!browser) return null;

			const changeSet = get({ subscribe });
			const imageRef = changeSet.images[imageId];

			if (!imageRef) return null;

			try {
				return await imageDb.getImage(imageRef.storageKey);
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

			// Clear all image data from IndexedDB (fire-and-forget)
			imageDb.clearAll().catch((e) => {
				console.error('Failed to clear images from IndexedDB:', e);
			});

			// Clear the change set
			set(createEmptyChangeSet());
			localStorage.removeItem(STORAGE_KEY_CHANGES);
		},

		/**
		 * Export all changes as JSON (async — reads images from IndexedDB)
		 */
		async exportChanges(): Promise<ChangeExport> {
			const changeSet = get({ subscribe });
			const rawChanges = getAllChanges(changeSet.tree);

			// Ensure schemas are loaded so we can filter data to schema-valid keys
			const entityTypes = new Set(rawChanges.map((c) => c.entity.type));
			await Promise.all([...entityTypes].map((t) => getAllowedKeys(t)));

			const changes = rawChanges.map((change) => ({
				...change,
				data: change.data ? filterToSchema(change.data, change.entity.type) : change.data,
				originalData: change.originalData ? filterToSchema(change.originalData, change.entity.type) : change.originalData
			}));

			// Build image export with embedded base64 data
			const images: ChangeExport['images'] = {};

			if (browser) {
				await Promise.all(
					Object.entries(changeSet.images).map(async ([imageId, imageRef]) => {
						const data = await imageDb.getImage(imageRef.storageKey);
						if (data) {
							images[imageId] = {
								filename: imageRef.filename,
								mimeType: imageRef.mimeType,
								data
							};
						}
					})
				);
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
		 * Import changes from a ChangeExport (e.g. deflated from a previous submission).
		 * Replaces the current change set entirely.
		 */
		async importChanges(exportData: ChangeExport) {
			if (!browser) return;

			// Clear existing images from IndexedDB
			await imageDb.clearAll().catch(() => {});

			// Ensure schemas are loaded so imported data is filtered to valid keys
			const entityTypes = new Set(exportData.changes.map((c) => c.entity.type));
			await Promise.all([...entityTypes].map((t) => getAllowedKeys(t)));

			// Build a new change set from the imported data
			const newChangeSet = createEmptyChangeSet();

			for (const change of exportData.changes) {
				const ep = parsePath(change.entity.path);
				if (!ep) continue;
				const cleaned = {
					...change,
					data: change.data ? filterToSchema(change.data, change.entity.type) : change.data,
					originalData: change.originalData ? filterToSchema(change.originalData, change.entity.type) : change.originalData
				};
				treeSetChange(newChangeSet, ep, cleaned);
			}

			// Store imported images into IndexedDB
			await Promise.all(
				Object.entries(exportData.images).map(async ([imageId, imageData]) => {
					const storageKey = `${STORAGE_KEY_IMAGES_PREFIX}${imageId}`;
					try {
						await imageDb.setImage(storageKey, imageData.data);
					} catch (e) {
						console.error('Failed to store imported image:', e);
						return;
					}

					newChangeSet.images[imageId] = {
						id: imageId,
						entityPath: '',
						property: '',
						filename: imageData.filename,
						mimeType: imageData.mimeType,
						storageKey
					};

					// Try to parse imageId to extract entityPath and property
					const parts = imageId.split(':');
					if (parts.length >= 2) {
						newChangeSet.images[imageId].entityPath = parts[0];
						newChangeSet.images[imageId].property = parts[1];
					}
				})
			);

			newChangeSet.lastModified = Date.now();
			set(newChangeSet);
			persistChangeSet(newChangeSet);
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
		},

		/**
		 * Get a detailed breakdown of changes by entity type and operation.
		 * Returns human-readable strings like "3 new brands", "2 modified filaments".
		 */
		getDetailedSummary(): string[] {
			const changeSet = get({ subscribe });
			const changes = getAllChanges(changeSet.tree);

			const counts: Record<string, Record<string, number>> = {};
			for (const c of changes) {
				const type = c.entity.type;
				if (!counts[type]) counts[type] = {};
				counts[type][c.operation] = (counts[type][c.operation] || 0) + 1;
			}

			const plurals: Record<string, string> = {
				store: 'stores',
				brand: 'brands',
				material: 'materials',
				filament: 'filaments',
				variant: 'variants'
			};

			const labels: Record<string, string> = {
				create: 'new',
				update: 'modified',
				delete: 'deleted'
			};

			const parts: string[] = [];
			for (const [type, ops] of Object.entries(counts)) {
				for (const [op, count] of Object.entries(ops)) {
					const noun = count === 1 ? type : (plurals[type] || `${type}s`);
					parts.push(`${count} ${labels[op] || op} ${noun}`);
				}
			}

			return parts;
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
