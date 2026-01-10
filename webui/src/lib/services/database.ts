import type { Store, Brand, DatabaseIndex, Material, Filament, Variant } from '$lib/types/database';
import type { EntityIdentifier } from '$lib/types/changes';
import { get } from 'svelte/store';
import { isCloudMode } from '$lib/stores/environment';
import { changeStore } from '$lib/stores/changes';
import { apiFetch } from '$lib/utils/api';

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
	 * Layer changes over base data
	 * Handles create, update, and delete operations
	 */
	private layerChanges<T extends { id: string }>(
		baseData: T[],
		entityPathPrefix: string
	): T[] {
		if (!get(isCloudMode)) {
			return baseData;
		}

		const changeSet = get(changeStore);
		const result = new Map<string, T>();

		// Start with base data
		for (const item of baseData) {
			result.set(item.id, item);
		}

		// Apply changes
		for (const [path, change] of Object.entries(changeSet.changes)) {
			if (!path.startsWith(entityPathPrefix)) continue;

			switch (change.operation) {
				case 'create':
					// Add new entity
					if (change.data) {
						result.set(change.data.id, change.data);
					}
					break;

				case 'update':
					// Update existing entity
					if (change.data) {
						result.set(change.data.id, change.data);
					}
					break;

				case 'delete':
					// Remove entity
					result.delete(change.entity.id);
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
		const change = changeSet.changes[entityPath];

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

			// Layer changes over base data
			return this.layerChanges(baseStores, 'stores/');
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

			// Layer changes over base data
			return this.layerChanges(baseBrands, 'brands/');
		} catch (error) {
			console.error('Error loading brands:', error);
			return [];
		}
	}

	/**
	 * Get a specific store by ID
	 * In cloud mode, returns version with changes applied
	 */
	async getStore(id: string): Promise<Store | null> {
		try {
			const entityPath = `stores/${id}`;

			const response = await apiFetch(`/api/stores/${id}`);
			if (!response.ok) {
				return null;
			}
			const baseStore = await response.json();

			// Apply changes
			return this.getEntityWithChanges(baseStore, entityPath);
		} catch (error) {
			console.error(`Error loading store ${id}:`, error);
			return null;
		}
	}

	/**
	 * Get a specific brand by ID
	 * In cloud mode, returns version with changes applied
	 */
	async getBrand(id: string): Promise<Brand | null> {
		try {
			const entityPath = `brands/${id}`;

			const response = await apiFetch(`/api/brands/${id}`);
			if (!response.ok) {
				return null;
			}
			const baseBrand = await response.json();

			// Apply changes
			return this.getEntityWithChanges(baseBrand, entityPath);
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
			const entityPath = `stores/${store.id}`;
			const entity: EntityIdentifier = {
				type: 'store',
				path: entityPath,
				id: store.id
			};

			if (get(isCloudMode)) {
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
			const entityPath = `stores/${id}`;
			const entity: EntityIdentifier = {
				type: 'store',
				path: entityPath,
				id
			};

			if (get(isCloudMode)) {
				// Track deletion in cloud mode
				changeStore.trackDelete(entity, store);
				return true;
			}

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
			const entityPath = `brands/${brand.id}`;
			const entity: EntityIdentifier = {
				type: 'brand',
				path: entityPath,
				id: brand.id
			};

			if (get(isCloudMode)) {
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
			const entityPath = `brands/${id}`;
			const entity: EntityIdentifier = {
				type: 'brand',
				path: entityPath,
				id
			};

			if (get(isCloudMode)) {
				changeStore.trackDelete(entity, brand);
				return true;
			}

			const response = await apiFetch(`/api/brands/${id}`, {
				method: 'DELETE'
			});
			return response.ok;
		} catch (error) {
			console.error(`Error deleting brand ${id}:`, error);
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
