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

		// Apply changes - only match direct children, not nested paths
		for (const [path, change] of Object.entries(changeSet.changes)) {
			if (!path.startsWith(entityPathPrefix)) continue;

			// Extract the entity id from the path (the part after the prefix, before any further slashes)
			const relativePath = path.slice(entityPathPrefix.length);
			const entityId = relativePath.split('/')[0];

			// Only apply if this is a direct child (no further path segments beyond the entity id)
			if (relativePath !== entityId) continue;

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
						result.set(dataId, change.data);
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

			// In cloud mode, check if this is a newly created store first
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);
				const change = changeSet.changes[entityPath];

				// If it's a newly created store, return it directly
				if (change && change.operation === 'create') {
					return change.data || null;
				}
			}

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

			// In cloud mode, check if this is a newly created brand first
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);
				const change = changeSet.changes[entityPath];

				// If it's a newly created brand, return it directly
				if (change && change.operation === 'create') {
					return change.data || null;
				}
			}

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

	// ============================================
	// Material methods
	// ============================================

	/**
	 * Load all materials for a brand
	 * In cloud mode, layers pending changes over base data
	 */
	async loadMaterials(brandId: string): Promise<Material[]> {
		try {
			const response = await apiFetch(`/api/brands/${brandId}/materials`);
			if (!response.ok) {
				throw new Error(`Failed to load materials: ${response.statusText}`);
			}
			const baseMaterials = await response.json();

			// Layer changes over base data
			// Materials use materialType as their id (e.g., "pla", "petg")
			return this.layerChanges(baseMaterials, `brands/${brandId}/materials/`);
		} catch (error) {
			console.error(`Error loading materials for brand ${brandId}:`, error);
			return [];
		}
	}

	/**
	 * Get a specific material by brand ID and material type
	 * In cloud mode, returns version with changes applied
	 */
	async getMaterial(brandId: string, materialType: string): Promise<Material | null> {
		try {
			const entityPath = `brands/${brandId}/materials/${materialType}`;

			// In cloud mode, check if this is a newly created material first
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);
				const change = changeSet.changes[entityPath];

				if (change && change.operation === 'create') {
					return change.data || null;
				}
			}

			const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType}`);
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
			const entityPath = `brands/${brandId}/materials/${materialType}`;
			const entity: EntityIdentifier = {
				type: 'material',
				path: entityPath,
				id: materialType
			};

			if (get(isCloudMode)) {
				if (!oldMaterial) {
					changeStore.trackCreate(entity, material);
				} else {
					changeStore.trackUpdate(entity, oldMaterial, material);
				}
				return true;
			}

			const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(material)
			});
			return response.ok;
		} catch (error) {
			console.error(`Error saving material ${brandId}/${materialType}:`, error);
			return false;
		}
	}

	/**
	 * Delete a material
	 */
	async deleteMaterial(brandId: string, materialType: string, material?: Material): Promise<boolean> {
		try {
			const entityPath = `brands/${brandId}/materials/${materialType}`;
			const entity: EntityIdentifier = {
				type: 'material',
				path: entityPath,
				id: materialType
			};

			if (get(isCloudMode)) {
				changeStore.trackDelete(entity, material);
				return true;
			}

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
		try {
			const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType}/filaments`);
			if (!response.ok) {
				throw new Error(`Failed to load filaments: ${response.statusText}`);
			}
			const baseFilaments = await response.json();

			// Layer changes over base data
			return this.layerChanges(baseFilaments, `brands/${brandId}/materials/${materialType}/filaments/`);
		} catch (error) {
			console.error(`Error loading filaments for ${brandId}/${materialType}:`, error);
			return [];
		}
	}

	/**
	 * Get a specific filament
	 * In cloud mode, returns version with changes applied
	 */
	async getFilament(brandId: string, materialType: string, filamentId: string): Promise<Filament | null> {
		try {
			const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;

			// In cloud mode, check if this is a newly created filament first
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);
				const change = changeSet.changes[entityPath];

				if (change && change.operation === 'create') {
					return change.data || null;
				}
			}

			const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}`);
			if (!response.ok) {
				return null;
			}
			const baseFilament = await response.json();

			if (baseFilament.error) {
				return null;
			}

			return this.getEntityWithChanges(baseFilament, entityPath);
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
			const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;
			const entity: EntityIdentifier = {
				type: 'filament',
				path: entityPath,
				id: filamentId
			};

			if (get(isCloudMode)) {
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
	 * Delete a filament
	 */
	async deleteFilament(
		brandId: string,
		materialType: string,
		filamentId: string,
		filament?: Filament
	): Promise<boolean> {
		try {
			const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;
			const entity: EntityIdentifier = {
				type: 'filament',
				path: entityPath,
				id: filamentId
			};

			if (get(isCloudMode)) {
				changeStore.trackDelete(entity, filament);
				return true;
			}

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
		try {
			const response = await apiFetch(
				`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants`
			);
			if (!response.ok) {
				throw new Error(`Failed to load variants: ${response.statusText}`);
			}
			const baseVariants = await response.json();

			// Layer changes over base data
			// Variants use slug as their id
			return this.layerChanges(baseVariants, `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/`);
		} catch (error) {
			console.error(`Error loading variants for ${brandId}/${materialType}/${filamentId}:`, error);
			return [];
		}
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

			// In cloud mode, check if this is a newly created variant first
			if (get(isCloudMode)) {
				const changeSet = get(changeStore);
				const change = changeSet.changes[entityPath];

				if (change && change.operation === 'create') {
					return change.data || null;
				}
			}

			const response = await apiFetch(
				`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`
			);
			if (!response.ok) {
				return null;
			}
			const baseVariant = await response.json();

			if (baseVariant.error) {
				return null;
			}

			return this.getEntityWithChanges(baseVariant, entityPath);
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
			const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`;
			const entity: EntityIdentifier = {
				type: 'variant',
				path: entityPath,
				id: variantSlug
			};

			if (get(isCloudMode)) {
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
			const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`;
			const entity: EntityIdentifier = {
				type: 'variant',
				path: entityPath,
				id: variantSlug
			};

			if (get(isCloudMode)) {
				changeStore.trackDelete(entity, variant);
				return true;
			}

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
