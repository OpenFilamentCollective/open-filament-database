import type { Store, Brand, DatabaseIndex, Material, Filament, Variant } from '$lib/types/database';
import type { EntityChange, EntityIdentifier } from '$lib/types/changes';
import type { TreeChangeSet } from '$lib/types/changeTree';
import { get } from 'svelte/store';
import { isCloudMode } from '$lib/stores/environment';
import { changeStore } from '$lib/stores/changes';
import { apiFetch } from '$lib/utils/api';
import { parsePath } from '$lib/utils/changePaths';
import { getDirectChildren } from '$lib/utils/changeTreeOps';

/**
 * Service for indexing and managing the filament database
 * In cloud mode, layers changes over base data from API
 */
export class DatabaseService {
	private static instance: DatabaseService;
	private index: DatabaseIndex | null = null;

	private constructor() {}

	static getInstance(): DatabaseService {
		if (!DatabaseService.instance) {
			DatabaseService.instance = new DatabaseService();
		}
		return DatabaseService.instance;
	}

	/**
	 * Get direct child changes from the tree for a given path prefix.
	 * Replaces O(n) prefix scanning with O(k) tree navigation.
	 */
	private getDirectChildChanges(
		changeSet: TreeChangeSet,
		prefix: string
	): Array<{ entityId: string; change: EntityChange }> {
		// Root-level: stores/ or brands/
		if (prefix === 'stores/') {
			return Object.values(changeSet.tree.stores)
				.filter((n) => n.change)
				.map((n) => ({ entityId: n.key, change: n.change! }));
		}
		if (prefix === 'brands/') {
			return Object.values(changeSet.tree.brands)
				.filter((n) => n.change)
				.map((n) => ({ entityId: n.key, change: n.change! }));
		}

		// Nested: parse parent path and namespace from prefix (e.g., "brands/X/materials/" → parent="brands/X", ns="materials")
		const parts = prefix.slice(0, -1).split('/');
		const namespace = parts.pop()!;
		const parentPath = parts.join('/');
		const parentEp = parsePath(parentPath);
		if (!parentEp) return [];

		return getDirectChildren(changeSet.tree, parentEp, namespace)
			.filter((n) => n.change)
			.map((n) => ({ entityId: n.key, change: n.change! }));
	}

	/**
	 * Layer changes over base data
	 * Handles create, update, and delete operations
	 * @param baseData - Array of entities from the API
	 * @param entityPathPrefix - Path prefix to match changes (e.g., "brands/prusament/materials/")
	 * @param idKey - The property name to use as the entity identifier (defaults to 'id')
	 */
	private layerChanges<T>(
		baseData: T[],
		entityPathPrefix: string,
		idKey: keyof T = 'id' as keyof T
	): T[] {
		if (!get(isCloudMode)) {
			return baseData;
		}

		const changeSet = get(changeStore);
		const result = new Map<string, T>();

		// Start with base data
		for (const item of baseData) {
			const itemId = String(item[idKey]);
			result.set(itemId, item);
		}

		// Apply direct child changes from the tree (O(k) instead of O(n) scan)
		for (const { entityId, change } of this.getDirectChildChanges(changeSet, entityPathPrefix)) {
			switch (change.operation) {
				case 'create':
					// Add new entity
					if (change.data) {
						const dataId = String(change.data[idKey]);
						result.set(dataId, change.data);
					}
					break;

				case 'update':
					// Update existing entity
					if (change.data) {
						const dataId = String(change.data[idKey]);
						// If the ID changed, remove the old entry and add the new one
						// Use case-insensitive matching since paths use lowercase but data may use original case
						let oldKey = Array.from(result.keys()).find((k) => k.toLowerCase() === entityId.toLowerCase());
						// If not found by entityId (e.g. after a rename/moveSubtree), try originalData
						if (!oldKey && change.originalData) {
							const origId = String(change.originalData[idKey]);
							oldKey = Array.from(result.keys()).find((k) => k.toLowerCase() === origId.toLowerCase());
						}
						if (oldKey && oldKey !== dataId) {
							result.delete(oldKey);
						}
						result.set(dataId, change.data);
					}
					break;

				case 'delete':
					// Remove entity - use case-insensitive matching
					const keyToDelete = Array.from(result.keys()).find((k) => k.toLowerCase() === entityId.toLowerCase());
					if (keyToDelete) {
						result.delete(keyToDelete);
					}
					break;
			}
		}

		return Array.from(result.values());
	}

	/**
	 * Get a single entity with changes applied
	 */
	private getEntityWithChanges<T>(baseData: T | null, entityPath: string): T | null {
		if (!get(isCloudMode)) {
			return baseData;
		}

		const changeSet = get(changeStore);
		const change = changeSet._index.get(entityPath)?.change;

		if (!change) {
			return baseData;
		}

		switch (change.operation) {
			case 'delete':
				// Entity is deleted
				return null;

			case 'create':
			case 'update':
				// Return changed data
				return change.data || baseData;

			default:
				return baseData;
		}
	}

	/**
	 * Check if an entity or any of its ancestors is a local create
	 * This helps avoid unnecessary API calls for entities that don't exist on the server
	 */
	private isLocalCreate(entityPath: string): boolean {
		if (!get(isCloudMode)) {
			return false;
		}

		const changeSet = get(changeStore);

		// Check the exact path via O(1) index lookup
		const change = changeSet._index.get(entityPath)?.change;
		if (change?.operation === 'create') {
			return true;
		}

		// Check ancestor paths (e.g., for brands/X/materials/Y, check brands/X)
		const parts = entityPath.split('/');
		for (let i = parts.length - 2; i >= 2; i -= 2) {
			const ancestorPath = parts.slice(0, i).join('/');
			const ancestorChange = changeSet._index.get(ancestorPath)?.change;
			if (ancestorChange?.operation === 'create') {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get the original material type for API calls when a material has been renamed.
	 * Returns the original materialType (lowercased) if there's a pending rename,
	 * otherwise returns the input unchanged.
	 */
	private getApiMaterialType(brandId: string, materialType: string): string {
		if (!get(isCloudMode)) return materialType;

		const original = this.getOriginalMaterial(brandId, materialType);
		if (original) {
			const origType = ((original as any).slug || original.materialType || original.material || '');
			if (origType && origType.toLowerCase() !== materialType.toLowerCase()) {
				return origType.toLowerCase();
			}
		}
		return materialType;
	}

	/**
	 * Load the complete database index
	 */
	async loadIndex(): Promise<DatabaseIndex> {
		if (this.index) {
			return this.index;
		}

		try {
			// Fetch stores and brands in parallel
			const [stores, brands] = await Promise.all([this.loadStores(), this.loadBrands()]);

			this.index = { stores, brands };
			return this.index;
		} catch (error) {
			console.error('Failed to load database index:', error);
			throw error;
		}
	}

	/**
	 * Load all stores from the /stores directory
	 * In cloud mode, layers pending changes over base data
	 */
	async loadStores(): Promise<Store[]> {
		try {
			const response = await apiFetch('/api/stores');
			if (!response.ok) {
				throw new Error(`Failed to load stores: ${response.statusText}`);
			}
			const baseStores = await response.json();

			// Layer changes over base data (keyed by slug to match tree paths)
			return this.layerChanges(baseStores, 'stores/', 'slug' as keyof Store);
		} catch (error) {
			console.error('Error loading stores:', error);
			return [];
		}
	}

	/**
	 * Load all brands from the /data directory
	 * In cloud mode, layers pending changes over base data
	 */
	async loadBrands(): Promise<Brand[]> {
		try {
			const response = await apiFetch('/api/brands');
			if (!response.ok) {
				throw new Error(`Failed to load brands: ${response.statusText}`);
			}
			const baseBrands = await response.json();

			// Layer changes over base data (keyed by slug to match tree paths)
			return this.layerChanges(baseBrands, 'brands/', 'slug' as keyof Brand);
		} catch (error) {
			console.error('Error loading brands:', error);
			return [];
		}
	}

	/**
	 * Get a specific store by ID (can be slug or UUID)
	 * In cloud mode, returns version with changes applied
	 */
	async getStore(id: string): Promise<Store | null> {
		try {
			const entityPath = `stores/${id}`;

			// In cloud mode, check for local changes first
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);
				const change = changeSet._index.get(entityPath)?.change;

				if (change && change.operation === 'create') {
					return change.data || null;
				}
				if (change && change.operation === 'delete') {
					return null;
				}
			}

			const response = await apiFetch(`/api/stores/${id}`);
			if (!response.ok) {
				return null;
			}
			const baseStore: Store = await response.json();

			// Apply changes - use slug for lookup since tree paths use slugs (matching URL structure)
			const actualEntityPath = `stores/${baseStore.slug || baseStore.id}`;
			return this.getEntityWithChanges(baseStore, actualEntityPath);
		} catch (error) {
			console.error(`Error loading store ${id}:`, error);
			return null;
		}
	}

	/**
	 * Get a specific brand by ID (can be slug or UUID)
	 * In cloud mode, returns version with changes applied
	 */
	async getBrand(id: string): Promise<Brand | null> {
		try {
			const entityPath = `brands/${id}`;

			// In cloud mode, check for local changes first
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);
				const change = changeSet._index.get(entityPath)?.change;

				if (change && change.operation === 'create') {
					return change.data || null;
				}
				if (change && change.operation === 'delete') {
					return null;
				}
			}

			const response = await apiFetch(`/api/brands/${id}`);
			if (!response.ok) {
				return null;
			}
			const baseBrand: Brand = await response.json();

			// Apply changes - use slug for lookup since tree paths use slugs (matching URL structure)
			const actualEntityPath = `brands/${baseBrand.slug || baseBrand.id}`;
			return this.getEntityWithChanges(baseBrand, actualEntityPath);
		} catch (error) {
			console.error(`Error loading brand ${id}:`, error);
			return null;
		}
	}

	/**
	 * Save a store
	 * In cloud mode: tracks changes in localStorage
	 * In local mode: saves to filesystem via API
	 */
	async saveStore(store: Store, oldStore?: Store): Promise<boolean> {
		try {
			const slug = store.slug || store.id;
			const newPath = `stores/${slug}`;
			const entity: EntityIdentifier = {
				type: 'store',
				path: newPath,
				id: store.id
			};

			if (get(isCloudMode)) {
				// If store slug changed, find and move the existing change
				const oldSlug = oldStore ? (oldStore.slug || oldStore.id) : slug;
				if (oldStore && oldSlug !== slug) {
					const oldPath = `stores/${oldSlug}`;
					const changeSet = get(changeStore);
					if (changeSet._index.has(oldPath)) {
						changeStore.moveChange(oldPath, newPath, entity);
					}
				}

				// Track change in cloud mode
				if (!oldStore) {
					// New store
					changeStore.trackCreate(entity, store);
				} else {
					// Update existing store
					changeStore.trackUpdate(entity, oldStore, store);
				}
				return true;
			}

			// In local mode, save to filesystem via API
			const response = await apiFetch(`/api/stores/${store.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(store)
			});
			return response.ok;
		} catch (error) {
			console.error(`Error saving store ${store.id}:`, error);
			return false;
		}
	}

	/**
	 * Delete a store
	 * In cloud mode: tracks deletion in localStorage
	 * In local mode: deletes from filesystem via API
	 */
	async deleteStore(id: string, store?: Store): Promise<boolean> {
		try {
			let entityPath = `stores/${id}`;
			const storePrefix = 'stores/';

			if (get(isCloudMode)) {
				// Find the actual path for this store in case it was renamed
				const changeSet = get(changeStore);

				for (const { entityId, change } of this.getDirectChildChanges(changeSet, storePrefix)) {
					if (change.data) {
						const dataId = (change.data.id || change.data.slug || change.data.name || '').toLowerCase();
						if (dataId === id.toLowerCase()) {
							entityPath = change.entity.path;
							break;
						}
					}
				}

				const entity: EntityIdentifier = {
					type: 'store',
					path: entityPath,
					id
				};
				// Track deletion in cloud mode
				changeStore.trackDelete(entity, store);
				return true;
			}

			const entity: EntityIdentifier = {
				type: 'store',
				path: entityPath,
				id
			};

			// In local mode, delete from filesystem via API
			const response = await apiFetch(`/api/stores/${id}`, {
				method: 'DELETE'
			});
			return response.ok;
		} catch (error) {
			console.error(`Error deleting store ${id}:`, error);
			return false;
		}
	}

	/**
	 * Save a brand
	 */
	async saveBrand(brand: Brand, oldBrand?: Brand): Promise<boolean> {
		try {
			const slug = brand.slug || brand.id;
			const newPath = `brands/${slug}`;
			const entity: EntityIdentifier = {
				type: 'brand',
				path: newPath,
				id: brand.id
			};

			if (get(isCloudMode)) {
				// If brand slug changed, find and move the existing change
				const oldSlug = oldBrand ? (oldBrand.slug || oldBrand.id) : slug;
				if (oldBrand && oldSlug !== slug) {
					const oldPath = `brands/${oldSlug}`;
					const changeSet = get(changeStore);
					if (changeSet._index.has(oldPath)) {
						changeStore.moveChange(oldPath, newPath, entity);
					}
				}

				if (!oldBrand) {
					changeStore.trackCreate(entity, brand);
				} else {
					changeStore.trackUpdate(entity, oldBrand, brand);
				}
				return true;
			}

			const response = await apiFetch(`/api/brands/${brand.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(brand)
			});
			return response.ok;
		} catch (error) {
			console.error(`Error saving brand ${brand.id}:`, error);
			return false;
		}
	}

	/**
	 * Delete a brand
	 */
	async deleteBrand(id: string, brand?: Brand): Promise<boolean> {
		try {
			let entityPath = `brands/${id}`;
			const brandPrefix = 'brands/';

			if (get(isCloudMode)) {
				// Find the actual path for this brand in case it was renamed
				const changeSet = get(changeStore);

				for (const { entityId, change } of this.getDirectChildChanges(changeSet, brandPrefix)) {
					if (change.data) {
						const dataId = (change.data.id || change.data.slug || change.data.name || '').toLowerCase();
						if (dataId === id.toLowerCase()) {
							entityPath = change.entity.path;
							break;
						}
					}
				}

				const entity: EntityIdentifier = {
					type: 'brand',
					path: entityPath,
					id
				};
				changeStore.trackDelete(entity, brand);
				return true;
			}

			const entity: EntityIdentifier = {
				type: 'brand',
				path: entityPath,
				id
			};

			const response = await apiFetch(`/api/brands/${id}`, {
				method: 'DELETE'
			});
			return response.ok;
		} catch (error) {
			console.error(`Error deleting brand ${id}:`, error);
			return false;
		}
	}

	// ============================================
	// Material methods
	// ============================================

	/**
	 * Load all materials for a brand
	 * In cloud mode, layers pending changes over base data
	 */
	async loadMaterials(brandId: string): Promise<Material[]> {
		let baseMaterials: Material[] = [];
		const brandPath = `brands/${brandId}`;

		// Skip API call if the brand is a local create (doesn't exist on server)
		if (!this.isLocalCreate(brandPath)) {
			try {
				const response = await apiFetch(`/api/brands/${brandId}/materials`);
				if (response.ok) {
					baseMaterials = await response.json();
				}
				// If response is not ok (e.g., brand doesn't exist on server),
				// we still continue with empty baseMaterials to pick up local changes
			} catch (error) {
				console.error(`Error loading materials for brand ${brandId}:`, error);
				// Continue with empty baseMaterials to pick up local changes
			}
		}

		// Layer changes over base data using custom material matching
		// This is called even when API fails or skipped, to show locally created materials
		return this.layerMaterialChanges(baseMaterials, brandId);
	}

	/**
	 * Layer material changes over base data
	 * Materials are matched by slug, materialType, or material name (case-insensitive)
	 */
	private layerMaterialChanges(baseData: Material[], brandId: string): Material[] {
		if (!get(isCloudMode)) {
			return baseData;
		}

		const changeSet = get(changeStore);
		const entityPathPrefix = `brands/${brandId}/materials/`;

		// Create a map using material identifier (slug or materialType or material name, lowercase)
		const result = new Map<string, Material>();
		for (const item of baseData) {
			// Use slug, materialType, or derive from material name as the key
			const key = (item.slug || item.materialType || item.material || item.id).toLowerCase();
			result.set(key, item);
		}

		// Apply direct child changes from the tree (O(k) instead of O(n) scan)
		for (const { entityId, change } of this.getDirectChildChanges(changeSet, entityPathPrefix)) {
			switch (change.operation) {
				case 'create':
					if (change.data) {
						const newKey = (change.data.materialType || change.data.material || '').toLowerCase();
						if (newKey) {
							result.set(newKey, change.data);
						}
					}
					break;

				case 'update':
					if (change.data) {
						const newKey = (change.data.materialType || change.data.material || '').toLowerCase();
						// Find and remove the old entry (matched by entityId from path)
						let oldKey = Array.from(result.keys()).find((k) => k.toLowerCase() === entityId.toLowerCase());
						// If not found by entityId (e.g. after a rename/moveSubtree), try originalData
						if (!oldKey && change.originalData) {
							const origKey = ((change.originalData as any).slug || change.originalData.materialType || change.originalData.material || '').toLowerCase();
							oldKey = Array.from(result.keys()).find((k) => k.toLowerCase() === origKey);
						}
						if (oldKey && oldKey !== newKey) {
							result.delete(oldKey);
						}
						if (newKey) {
							result.set(newKey, change.data);
						}
					}
					break;

				case 'delete':
					// Remove by entityId (case-insensitive)
					const keyToDelete = Array.from(result.keys()).find((k) => k.toLowerCase() === entityId.toLowerCase());
					if (keyToDelete) {
						result.delete(keyToDelete);
					}
					break;
			}
		}

		return Array.from(result.values());
	}

	/**
	 * Get the original (pre-change) material data for a brand/materialType
	 * Returns null if there are no pending changes or no original data
	 */
	getOriginalMaterial(brandId: string, materialType: string): Material | null {
		if (!get(isCloudMode)) return null;

		const changeSet = get(changeStore);
		const materialPrefix = `brands/${brandId}/materials/`;

		// Look for a change that contains this material (O(k) tree navigation)
		for (const { entityId, change } of this.getDirectChildChanges(changeSet, materialPrefix)) {
			// Check if this change's data matches the materialType we're looking for
			if (change.data?.materialType?.toUpperCase() === materialType.toUpperCase()) {
				return change.originalData || null;
			}

			// Also check by path segment (entityId is the tree node key)
			if (entityId.toLowerCase() === materialType.toLowerCase()) {
				return change.originalData || null;
			}
		}

		return null;
	}

	/**
	 * Get a specific material by brand ID and material type
	 * In cloud mode, returns version with changes applied
	 */
	async getMaterial(brandId: string, materialType: string): Promise<Material | null> {
		try {
			const entityPath = `brands/${brandId}/materials/${materialType}`;
			const materialPrefix = `brands/${brandId}/materials/`;

			// In cloud mode, check for changes
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);

				// First check for exact path match via O(1) index lookup
				let change = changeSet._index.get(entityPath)?.change;

				// If not found, look for a change where the NEW materialType matches what we're looking for
				// This handles the case where material was renamed (e.g., path is "materials/pla" but data.materialType is "PETG")
				if (!change) {
					for (const { entityId, change: c } of this.getDirectChildChanges(changeSet, materialPrefix)) {
						if (c.data?.materialType?.toUpperCase() === materialType.toUpperCase()) {
							change = c;
							break;
						}
					}
				}

				if (change) {
					if (change.operation === 'create' || change.operation === 'update') {
						return change.data || null;
					}
					if (change.operation === 'delete') {
						return null;
					}
				}

				// Skip API call if the brand is a local create (the material can't exist on server)
				if (this.isLocalCreate(`brands/${brandId}`)) {
					return null;
				}
			}

			// Try to fetch from API - use lowercase for filesystem compatibility
			const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType.toLowerCase()}`);
			if (!response.ok) {
				return null;
			}
			const baseMaterial = await response.json();

			if (baseMaterial.error) {
				return null;
			}

			return this.getEntityWithChanges(baseMaterial, entityPath);
		} catch (error) {
			console.error(`Error loading material ${brandId}/${materialType}:`, error);
			return null;
		}
	}

	/**
	 * Save a material
	 */
	async saveMaterial(brandId: string, materialType: string, material: Material, oldMaterial?: Material): Promise<boolean> {
		try {
			// In cloud mode, we need to find the correct path for this material
			// If there's an existing change, use that path to ensure we update in place
			// This handles the case where material type changed (e.g., PLA -> PETG -> PLA should revert)
			const materialPrefix = `brands/${brandId}/materials/`;

			// Get the NEW material type from the material object (not the URL param which is old)
			const newMaterialType = material.materialType || materialType;
			let entityPath = `brands/${brandId}/materials/${newMaterialType}`;

			if (get(isCloudMode)) {
				const changeSet = get(changeStore);

				// The new path is based on the NEW material type from the material object
				const newPath = `brands/${brandId}/materials/${newMaterialType}`;

				// Look for an existing change for this material
				// Strategy: Find a change where the originalData or data matches our oldMaterial
				let existingPath: string | undefined;
				let trueOriginalData = oldMaterial;

				if (oldMaterial) {
					const oldKey = (oldMaterial.slug || oldMaterial.materialType || oldMaterial.material || '').toLowerCase();
					for (const { entityId, change } of this.getDirectChildChanges(changeSet, materialPrefix)) {
						// Check if this change's originalData matches our oldMaterial
						const origData = change.originalData;
						if (origData) {
							const origKey = (origData.slug || origData.materialType || origData.material || '').toLowerCase();
							if (origKey === oldKey) {
								existingPath = change.entity.path;
								if (origData) trueOriginalData = origData;
								break;
							}
						}

						// Also check if the change data matches our old material
						if (change.data) {
							const dataKey = (change.data.slug || change.data.materialType || change.data.material || '').toLowerCase();
							if (dataKey === oldKey) {
								existingPath = change.entity.path;
								if (change.originalData) trueOriginalData = change.originalData;
								break;
							}
						}
					}
				}

				const entity: EntityIdentifier = {
					type: 'material',
					path: newPath,
					id: material.materialType || materialType
				};

				// If the path changed (material was renamed), move the change and its children
				if (existingPath && existingPath !== newPath) {
					changeStore.moveChange(existingPath, newPath, entity);
				}

				if (!oldMaterial) {
					changeStore.trackCreate(entity, material);
				} else {
					changeStore.trackUpdate(entity, trueOriginalData, material);
				}
				return true;
			}

			const entity: EntityIdentifier = {
				type: 'material',
				path: entityPath,
				id: newMaterialType
			};

			const response = await apiFetch(`/api/brands/${brandId}/materials/${newMaterialType}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(material)
			});
			return response.ok;
		} catch (error) {
			console.error(`Error saving material ${brandId}/${newMaterialType}:`, error);
			return false;
		}
	}

	/**
	 * Create a new material
	 */
	async createMaterial(brandId: string, material: Material): Promise<{ success: boolean; materialType?: string }> {
		try {
			// Generate materialType from material name if not provided (uppercase)
			const materialType = material.materialType ||
				material.material.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

			const entityPath = `brands/${brandId}/materials/${materialType}`;
			const entity: EntityIdentifier = {
				type: 'material',
				path: entityPath,
				id: materialType
			};

			const materialWithId = { ...material, id: materialType, materialType };

			if (get(isCloudMode)) {
				changeStore.trackCreate(entity, materialWithId);
				return { success: true, materialType };
			}

			const response = await apiFetch(`/api/brands/${brandId}/materials`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(materialWithId)
			});

			if (response.ok) {
				return { success: true, materialType };
			}
			return { success: false };
		} catch (error) {
			console.error(`Error creating material for brand ${brandId}:`, error);
			return { success: false };
		}
	}

	/**
	 * Delete a material
	 */
	async deleteMaterial(brandId: string, materialType: string, material?: Material): Promise<boolean> {
		try {
			let entityPath = `brands/${brandId}/materials/${materialType}`;
			const materialPrefix = `brands/${brandId}/materials/`;

			if (get(isCloudMode)) {
				// Find the actual path for this material in case it was renamed
				// (the change might be stored under the original path, not the current materialType)
				const changeSet = get(changeStore);

				for (const { entityId, change } of this.getDirectChildChanges(changeSet, materialPrefix)) {
					if (change.data) {
						const dataKey = (change.data.materialType || change.data.material || '').toLowerCase();
						if (dataKey === materialType.toLowerCase()) {
							entityPath = change.entity.path;
							break;
						}
					}
				}

				const entity: EntityIdentifier = {
					type: 'material',
					path: entityPath,
					id: materialType
				};
				changeStore.trackDelete(entity, material);
				return true;
			}

			const entity: EntityIdentifier = {
				type: 'material',
				path: entityPath,
				id: materialType
			};

			const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType}`, {
				method: 'DELETE'
			});
			return response.ok;
		} catch (error) {
			console.error(`Error deleting material ${brandId}/${materialType}:`, error);
			return false;
		}
	}

	// ============================================
	// Filament methods
	// ============================================

	/**
	 * Load all filaments for a material
	 * In cloud mode, layers pending changes over base data
	 */
	async loadFilaments(brandId: string, materialType: string): Promise<Filament[]> {
		let baseFilaments: Filament[] = [];
		const materialPath = `brands/${brandId}/materials/${materialType}`;
		// Use original materialType for API if material was renamed locally
		const apiMaterialType = this.getApiMaterialType(brandId, materialType);

		// Skip API call if the material is a local create (doesn't exist on server)
		if (!this.isLocalCreate(materialPath)) {
			try {
				const response = await apiFetch(`/api/brands/${brandId}/materials/${apiMaterialType}/filaments`);
				if (response.ok) {
					baseFilaments = await response.json();
				}
				// If response is not ok, continue with empty array to pick up local changes
			} catch (error) {
				console.error(`Error loading filaments for ${brandId}/${materialType}:`, error);
				// Continue with empty array to pick up local changes
			}
		}

		// Layer changes over base data - called even when API fails or skipped
		// Keyed by slug to match tree paths (which use URL slugs, not UUIDs)
		return this.layerChanges(baseFilaments, `${materialPath}/filaments/`, 'slug' as keyof Filament);
	}

	/**
	 * Get a specific filament
	 * In cloud mode, returns version with changes applied
	 */
	async getFilament(brandId: string, materialType: string, filamentId: string): Promise<Filament | null> {
		try {
			const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;

			// In cloud mode, check for local changes first
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);
				const change = changeSet._index.get(entityPath)?.change;

				if (change && change.operation === 'create') {
					return change.data || null;
				}
				if (change && change.operation === 'delete') {
					return null;
				}
			}

			// Use original materialType for API if material was renamed locally
			const apiMaterialType = this.getApiMaterialType(brandId, materialType);
			const response = await apiFetch(`/api/brands/${brandId}/materials/${apiMaterialType}/filaments/${filamentId}`);
			if (!response.ok) {
				return null;
			}
			const baseFilament: Filament = await response.json();

			if ((baseFilament as any).error) {
				return null;
			}

			// Apply changes - use slug for lookup since tree paths use slugs (matching URL structure)
			const filamentSlug = (baseFilament as any).slug || baseFilament.id;
			const actualEntityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentSlug}`;
			return this.getEntityWithChanges(baseFilament, actualEntityPath);
		} catch (error) {
			console.error(`Error loading filament ${brandId}/${materialType}/${filamentId}:`, error);
			return null;
		}
	}

	/**
	 * Save a filament
	 */
	async saveFilament(
		brandId: string,
		materialType: string,
		filamentId: string,
		filament: Filament,
		oldFilament?: Filament
	): Promise<boolean> {
		try {
			const newPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;
			const entity: EntityIdentifier = {
				type: 'filament',
				path: newPath,
				id: filamentId
			};

			if (get(isCloudMode)) {
				// If filament ID changed, find and move the existing change
				if (oldFilament) {
					const oldId = oldFilament.slug || oldFilament.id;
					if (oldId && oldId !== filamentId) {
						const oldPath = `brands/${brandId}/materials/${materialType}/filaments/${oldId}`;
						const changeSet = get(changeStore);
						if (changeSet._index.has(oldPath)) {
							changeStore.moveChange(oldPath, newPath, entity);
						}
					}
				}

				if (!oldFilament) {
					changeStore.trackCreate(entity, filament);
				} else {
					changeStore.trackUpdate(entity, oldFilament, filament);
				}
				return true;
			}

			const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(filament)
			});
			return response.ok;
		} catch (error) {
			console.error(`Error saving filament ${brandId}/${materialType}/${filamentId}:`, error);
			return false;
		}
	}

	/**
	 * Create a new filament
	 */
	async createFilament(
		brandId: string,
		materialType: string,
		filament: Filament
	): Promise<{ success: boolean; filamentId?: string }> {
		try {
			// Generate filamentId from name if not provided
			const filamentId = filament.slug || filament.id ||
				filament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

			const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;
			const entity: EntityIdentifier = {
				type: 'filament',
				path: entityPath,
				id: filamentId
			};

			const filamentWithId = { ...filament, id: filamentId, slug: filamentId };

			if (get(isCloudMode)) {
				changeStore.trackCreate(entity, filamentWithId);
				return { success: true, filamentId };
			}

			const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType}/filaments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(filamentWithId)
			});

			if (response.ok) {
				return { success: true, filamentId };
			}
			return { success: false };
		} catch (error) {
			console.error(`Error creating filament for ${brandId}/${materialType}:`, error);
			return { success: false };
		}
	}

	/**
	 * Delete a filament
	 */
	async deleteFilament(
		brandId: string,
		materialType: string,
		filamentId: string,
		filament?: Filament
	): Promise<boolean> {
		try {
			let entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;
			const filamentPrefix = `brands/${brandId}/materials/${materialType}/filaments/`;

			if (get(isCloudMode)) {
				// Find the actual path for this filament in case it was renamed
				const changeSet = get(changeStore);

				for (const { entityId, change } of this.getDirectChildChanges(changeSet, filamentPrefix)) {
					if (change.data) {
						const dataId = (change.data.id || change.data.slug || change.data.name || '').toLowerCase();
						if (dataId === filamentId.toLowerCase()) {
							entityPath = change.entity.path;
							break;
						}
					}
				}

				const entity: EntityIdentifier = {
					type: 'filament',
					path: entityPath,
					id: filamentId
				};
				changeStore.trackDelete(entity, filament);
				return true;
			}

			const entity: EntityIdentifier = {
				type: 'filament',
				path: entityPath,
				id: filamentId
			};

			const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}`, {
				method: 'DELETE'
			});
			return response.ok;
		} catch (error) {
			console.error(`Error deleting filament ${brandId}/${materialType}/${filamentId}:`, error);
			return false;
		}
	}

	// ============================================
	// Variant methods
	// ============================================

	/**
	 * Load all variants for a filament
	 * In cloud mode, layers pending changes over base data
	 */
	async loadVariants(brandId: string, materialType: string, filamentId: string): Promise<Variant[]> {
		let baseVariants: Variant[] = [];
		const filamentPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;
		// Use original materialType for API if material was renamed locally
		const apiMaterialType = this.getApiMaterialType(brandId, materialType);

		// Skip API call if the filament is a local create (doesn't exist on server)
		if (!this.isLocalCreate(filamentPath)) {
			try {
				const response = await apiFetch(
					`/api/brands/${brandId}/materials/${apiMaterialType}/filaments/${filamentId}/variants`
				);
				if (response.ok) {
					baseVariants = await response.json();
				}
				// If response is not ok, continue with empty array to pick up local changes
			} catch (error) {
				console.error(`Error loading variants for ${brandId}/${materialType}/${filamentId}:`, error);
				// Continue with empty array to pick up local changes
			}
		}

		// Layer changes over base data - called even when API fails or skipped
		// Keyed by slug to match tree paths (which use URL slugs, not UUIDs)
		return this.layerChanges(baseVariants, `${filamentPath}/variants/`, 'slug' as keyof Variant);
	}

	/**
	 * Get a specific variant
	 * In cloud mode, returns version with changes applied
	 */
	async getVariant(
		brandId: string,
		materialType: string,
		filamentId: string,
		variantSlug: string
	): Promise<Variant | null> {
		try {
			const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`;

			// In cloud mode, check for local changes first
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);
				const change = changeSet._index.get(entityPath)?.change;

				if (change && change.operation === 'create') {
					return change.data || null;
				}
				if (change && change.operation === 'delete') {
					return null;
				}
			}

			// Use original materialType for API if material was renamed locally
			const apiMaterialType = this.getApiMaterialType(brandId, materialType);
			const response = await apiFetch(
				`/api/brands/${brandId}/materials/${apiMaterialType}/filaments/${filamentId}/variants/${variantSlug}`
			);
			if (!response.ok) {
				return null;
			}
			const baseVariant: Variant = await response.json();

			if ((baseVariant as any).error) {
				return null;
			}

			// Apply changes - use the actual variant.slug for lookup since changes are tracked by slug
			// The `variantSlug` parameter should match, but use the actual slug from the data to be safe
			const actualEntityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${baseVariant.slug}`;
			return this.getEntityWithChanges(baseVariant, actualEntityPath);
		} catch (error) {
			console.error(`Error loading variant ${brandId}/${materialType}/${filamentId}/${variantSlug}:`, error);
			return null;
		}
	}

	/**
	 * Save a variant
	 */
	async saveVariant(
		brandId: string,
		materialType: string,
		filamentId: string,
		variantSlug: string,
		variant: Variant,
		oldVariant?: Variant
	): Promise<boolean> {
		try {
			const newPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`;
			const entity: EntityIdentifier = {
				type: 'variant',
				path: newPath,
				id: variantSlug
			};

			if (get(isCloudMode)) {
				// If variant slug changed, find and move the existing change
				if (oldVariant) {
					const oldSlug = oldVariant.slug || oldVariant.id;
					if (oldSlug && oldSlug !== variantSlug) {
						const oldPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${oldSlug}`;
						const changeSet = get(changeStore);
						if (changeSet._index.has(oldPath)) {
							changeStore.moveChange(oldPath, newPath, entity);
						}
					}
				}

				if (!oldVariant) {
					changeStore.trackCreate(entity, variant);
				} else {
					changeStore.trackUpdate(entity, oldVariant, variant);
				}
				return true;
			}

			const response = await apiFetch(
				`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(variant)
				}
			);
			return response.ok;
		} catch (error) {
			console.error(`Error saving variant ${brandId}/${materialType}/${filamentId}/${variantSlug}:`, error);
			return false;
		}
	}

	/**
	 * Create a new variant
	 */
	async createVariant(
		brandId: string,
		materialType: string,
		filamentId: string,
		variant: Variant
	): Promise<{ success: boolean; variantSlug?: string }> {
		try {
			// Generate variantSlug from color name if not provided
			const variantSlug = variant.slug || variant.id ||
				variant.color_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

			const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`;
			const entity: EntityIdentifier = {
				type: 'variant',
				path: entityPath,
				id: variantSlug
			};

			const variantWithId = {
				...variant,
				id: variantSlug,
				slug: variantSlug,
				filament_id: filamentId
			};

			if (get(isCloudMode)) {
				changeStore.trackCreate(entity, variantWithId);
				return { success: true, variantSlug };
			}

			const response = await apiFetch(
				`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(variantWithId)
				}
			);

			if (response.ok) {
				return { success: true, variantSlug };
			}
			return { success: false };
		} catch (error) {
			console.error(`Error creating variant for ${brandId}/${materialType}/${filamentId}:`, error);
			return { success: false };
		}
	}

	/**
	 * Delete a variant
	 */
	async deleteVariant(
		brandId: string,
		materialType: string,
		filamentId: string,
		variantSlug: string,
		variant?: Variant
	): Promise<boolean> {
		try {
			let entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`;
			const variantPrefix = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/`;

			if (get(isCloudMode)) {
				// Find the actual path for this variant in case it was renamed
				const changeSet = get(changeStore);

				for (const { entityId, change } of this.getDirectChildChanges(changeSet, variantPrefix)) {
					if (change.data) {
						const dataId = (change.data.id || change.data.slug || change.data.color_name || '').toLowerCase();
						if (dataId === variantSlug.toLowerCase()) {
							entityPath = change.entity.path;
							break;
						}
					}
				}

				const entity: EntityIdentifier = {
					type: 'variant',
					path: entityPath,
					id: variantSlug
				};
				changeStore.trackDelete(entity, variant);
				return true;
			}

			const entity: EntityIdentifier = {
				type: 'variant',
				path: entityPath,
				id: variantSlug
			};

			const response = await apiFetch(
				`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`,
				{
					method: 'DELETE'
				}
			);
			return response.ok;
		} catch (error) {
			console.error(`Error deleting variant ${brandId}/${materialType}/${filamentId}/${variantSlug}:`, error);
			return false;
		}
	}

	/**
	 * Clear the cached index
	 */
	clearCache() {
		this.index = null;
	}
}

export const db = DatabaseService.getInstance();
