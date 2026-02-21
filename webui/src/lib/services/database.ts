import type { Store, Brand, DatabaseIndex, Material, Filament, Variant } from '$lib/types/database';
import type { EntityChange, EntityIdentifier, EntityType } from '$lib/types/changes';
import type { TreeChangeSet } from '$lib/types/changeTree';
import { get } from 'svelte/store';
import { useChangeTracking } from '$lib/stores/environment';
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

	// ============================================
	// Private utilities
	// ============================================

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

		// Nested: parse parent path and namespace from prefix
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
	 * Layer changes over base data.
	 * Handles create, update, and delete operations.
	 */
	private layerChanges<T>(
		baseData: T[],
		entityPathPrefix: string,
		idKey: keyof T = 'id' as keyof T
	): T[] {
		if (!get(useChangeTracking)) {
			return baseData;
		}

		const changeSet = get(changeStore);
		const result = new Map<string, T>();

		// Helper: get the identifier from an item, falling back to 'id' if the
		// preferred key is missing (e.g. local API may not include 'slug').
		const getId = (item: any): string =>
			String(item[idKey] ?? item['id'] ?? '');

		for (const item of baseData) {
			result.set(getId(item), item);
		}

		for (const { entityId, change } of this.getDirectChildChanges(changeSet, entityPathPrefix)) {
			switch (change.operation) {
				case 'create':
					if (change.data) {
						result.set(getId(change.data), change.data);
					}
					break;

				case 'update':
					if (change.data) {
						const dataId = getId(change.data);
						let oldKey = Array.from(result.keys()).find((k) => k.toLowerCase() === entityId.toLowerCase());
						if (!oldKey && change.originalData) {
							const origId = getId(change.originalData);
							oldKey = Array.from(result.keys()).find((k) => k.toLowerCase() === origId.toLowerCase());
						}
						if (oldKey && oldKey !== dataId) {
							result.delete(oldKey);
						}
						result.set(dataId, change.data);
					}
					break;

				case 'delete': {
					const keyToDelete = Array.from(result.keys()).find((k) => k.toLowerCase() === entityId.toLowerCase());
					if (keyToDelete) {
						result.delete(keyToDelete);
					}
					break;
				}
			}
		}

		return Array.from(result.values());
	}

	/**
	 * Get a single entity with changes applied
	 */
	private getEntityWithChanges<T>(baseData: T | null, entityPath: string): T | null {
		if (!get(useChangeTracking)) {
			return baseData;
		}

		const changeSet = get(changeStore);
		const change = changeSet._index.get(entityPath)?.change;

		if (!change) {
			return baseData;
		}

		switch (change.operation) {
			case 'delete':
				return null;
			case 'create':
			case 'update':
				return change.data || baseData;
			default:
				return baseData;
		}
	}

	/**
	 * Check if an entity or any of its ancestors is a local create.
	 */
	private isLocalCreate(entityPath: string): boolean {
		if (!get(useChangeTracking)) {
			return false;
		}

		const changeSet = get(changeStore);

		const change = changeSet._index.get(entityPath)?.change;
		if (change?.operation === 'create') {
			return true;
		}

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
	 */
	private getApiMaterialType(brandId: string, materialType: string): string {
		if (!get(useChangeTracking)) return materialType;

		const original = this.getOriginalMaterial(brandId, materialType);
		if (original) {
			const origType = ((original as any).slug || original.materialType || original.material || '');
			if (origType && origType.toLowerCase() !== materialType.toLowerCase()) {
				return origType.toLowerCase();
			}
		}
		return materialType;
	}

	// ============================================
	// Generic private helpers
	// ============================================

	/**
	 * Generic collection loader: fetch from API + layer changes.
	 * Handles local-create optimization (skips API if parent is local).
	 */
	private async _loadCollection<T>(
		apiUrl: string,
		changePrefix: string,
		idKey: keyof T,
		parentPath?: string
	): Promise<T[]> {
		let baseItems: T[] = [];

		if (!parentPath || !this.isLocalCreate(parentPath)) {
			const response = await apiFetch(apiUrl);
			if (response.ok) {
				baseItems = await response.json();
			} else {
				throw new Error(`Failed to load: ${response.statusText}`);
			}
		}

		return this.layerChanges(baseItems, changePrefix, idKey);
	}

	/**
	 * Generic entity getter: check local changes → fetch API → apply changes.
	 * @param resolveChangePath - Optional: compute the change path from API data (e.g., using slug instead of UUID)
	 */
	private async _getEntity<T>(
		entityPath: string,
		apiUrl: string,
		resolveChangePath?: (data: T) => string
	): Promise<T | null> {
		if (get(useChangeTracking)) {
			const changeSet = get(changeStore);
			const change = changeSet._index.get(entityPath)?.change;

			if (change?.operation === 'create') return change.data || null;
			if (change?.operation === 'delete') return null;

			// Skip API if any ancestor is a local create
			if (this.isLocalCreate(entityPath)) return null;
		}

		const response = await apiFetch(apiUrl);
		if (!response.ok) return null;
		const base: T = await response.json();
		if ((base as any).error) return null;

		const changePath = resolveChangePath ? resolveChangePath(base) : entityPath;
		return this.getEntityWithChanges(base, changePath);
	}

	/**
	 * Generic entity saver: handles rename detection, cloud tracking, and local API calls.
	 * @param buildOldPath - Optional: given oldData, compute the old entity path for rename detection
	 */
	private async _saveEntity(
		entityType: EntityType,
		newPath: string,
		apiUrl: string,
		id: string,
		data: any,
		oldData?: any,
		buildOldPath?: (oldData: any) => string
	): Promise<boolean> {
		try {
			const entity: EntityIdentifier = { type: entityType, path: newPath, id };

			if (get(useChangeTracking)) {
				// Handle renames
				if (oldData && buildOldPath) {
					const oldPath = buildOldPath(oldData);
					if (oldPath !== newPath) {
						const changeSet = get(changeStore);
						if (changeSet._index.has(oldPath)) {
							changeStore.moveChange(oldPath, newPath, entity);
						}
					}
				}

				if (!oldData) {
					changeStore.trackCreate(entity, data);
				} else {
					changeStore.trackUpdate(entity, oldData, data);
				}
				return true;
			}

			const response = await apiFetch(apiUrl, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			return response.ok;
		} catch (error) {
			console.error(`Error saving ${entityType}:`, error);
			return false;
		}
	}

	/**
	 * Generic entity creator: handles cloud tracking and local API calls.
	 * @param resultKey - Key name in the result object (e.g., 'materialType', 'filamentId', 'variantSlug')
	 */
	private async _createEntity(
		entityType: EntityType,
		entityPath: string,
		apiUrl: string,
		slug: string,
		data: any,
		resultKey: string
	): Promise<{ success: boolean; [key: string]: any }> {
		try {
			const entity: EntityIdentifier = { type: entityType, path: entityPath, id: slug };

			if (get(useChangeTracking)) {
				changeStore.trackCreate(entity, data);
				return { success: true, [resultKey]: slug };
			}

			const response = await apiFetch(apiUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			return response.ok ? { success: true, [resultKey]: slug } : { success: false };
		} catch (error) {
			console.error(`Error creating ${entityType}:`, error);
			return { success: false };
		}
	}

	/**
	 * Generic entity deleter: handles rename scanning, cloud tracking, and local API calls.
	 * @param matchFields - Fields to check when scanning for renamed entities (e.g., ['id', 'slug', 'name'])
	 */
	private async _deleteEntity(
		entityType: EntityType,
		entityPath: string,
		collectionPrefix: string,
		apiUrl: string,
		id: string,
		data?: any,
		matchFields: string[] = ['id', 'slug', 'name']
	): Promise<boolean> {
		try {
			let resolvedPath = entityPath;

			if (get(useChangeTracking)) {
				// Find the actual path in case entity was renamed
				const changeSet = get(changeStore);
				for (const { change } of this.getDirectChildChanges(changeSet, collectionPrefix)) {
					if (change.data) {
						for (const field of matchFields) {
							const val = (change.data[field] || '').toLowerCase();
							if (val && val === id.toLowerCase()) {
								resolvedPath = change.entity.path;
								break;
							}
						}
						if (resolvedPath !== entityPath) break;
					}
				}

				const entity: EntityIdentifier = { type: entityType, path: resolvedPath, id };
				changeStore.trackDelete(entity, data);
				return true;
			}

			const response = await apiFetch(apiUrl, { method: 'DELETE' });
			return response.ok;
		} catch (error) {
			console.error(`Error deleting ${entityType}:`, error);
			return false;
		}
	}

	// ============================================
	// Index
	// ============================================

	async loadIndex(): Promise<DatabaseIndex> {
		if (this.index) {
			return this.index;
		}

		try {
			const [stores, brands] = await Promise.all([this.loadStores(), this.loadBrands()]);
			this.index = { stores, brands };
			return this.index;
		} catch (error) {
			console.error('Failed to load database index:', error);
			throw error;
		}
	}

	// ============================================
	// Store methods
	// ============================================

	async loadStores(): Promise<Store[]> {
		return this._loadCollection<Store>('/api/stores', 'stores/', 'slug' as keyof Store);
	}

	async getStore(id: string): Promise<Store | null> {
		return this._getEntity<Store>(
			`stores/${id}`,
			`/api/stores/${id}`,
			(data) => `stores/${data.slug || data.id}`
		);
	}

	async saveStore(store: Store, oldStore?: Store): Promise<boolean> {
		const slug = store.slug || store.id;
		return this._saveEntity(
			'store',
			`stores/${slug}`,
			`/api/stores/${store.id}`,
			store.id,
			store,
			oldStore,
			oldStore ? (old) => `stores/${old.slug || old.id}` : undefined
		);
	}

	async deleteStore(id: string, store?: Store): Promise<boolean> {
		return this._deleteEntity(
			'store', `stores/${id}`, 'stores/',
			`/api/stores/${id}`, id, store
		);
	}

	// ============================================
	// Brand methods
	// ============================================

	async loadBrands(): Promise<Brand[]> {
		return this._loadCollection<Brand>('/api/brands', 'brands/', 'slug' as keyof Brand);
	}

	async getBrand(id: string): Promise<Brand | null> {
		return this._getEntity<Brand>(
			`brands/${id}`,
			`/api/brands/${id}`,
			(data) => `brands/${data.slug || data.id}`
		);
	}

	async saveBrand(brand: Brand, oldBrand?: Brand): Promise<boolean> {
		const slug = brand.slug || brand.id;
		return this._saveEntity(
			'brand',
			`brands/${slug}`,
			`/api/brands/${brand.id}`,
			brand.id,
			brand,
			oldBrand,
			oldBrand ? (old) => `brands/${old.slug || old.id}` : undefined
		);
	}

	async deleteBrand(id: string, brand?: Brand): Promise<boolean> {
		return this._deleteEntity(
			'brand', `brands/${id}`, 'brands/',
			`/api/brands/${id}`, id, brand
		);
	}

	// ============================================
	// Material methods (custom handling for renames)
	// ============================================

	/**
	 * Layer material changes over base data.
	 * Materials use a different key strategy (slug/materialType/material name).
	 */
	private layerMaterialChanges(baseData: Material[], brandId: string): Material[] {
		if (!get(useChangeTracking)) {
			return baseData;
		}

		const changeSet = get(changeStore);
		const entityPathPrefix = `brands/${brandId}/materials/`;

		const result = new Map<string, Material>();
		for (const item of baseData) {
			const key = (item.slug || item.materialType || item.material || item.id).toLowerCase();
			result.set(key, item);
		}

		for (const { entityId, change } of this.getDirectChildChanges(changeSet, entityPathPrefix)) {
			switch (change.operation) {
				case 'create':
					if (change.data) {
						const newKey = (change.data.materialType || change.data.material || '').toLowerCase();
						if (newKey) result.set(newKey, change.data);
					}
					break;

				case 'update':
					if (change.data) {
						const newKey = (change.data.materialType || change.data.material || '').toLowerCase();
						let oldKey = Array.from(result.keys()).find((k) => k.toLowerCase() === entityId.toLowerCase());
						if (!oldKey && change.originalData) {
							const origKey = ((change.originalData as any).slug || change.originalData.materialType || change.originalData.material || '').toLowerCase();
							oldKey = Array.from(result.keys()).find((k) => k.toLowerCase() === origKey);
						}
						if (oldKey && oldKey !== newKey) result.delete(oldKey);
						if (newKey) result.set(newKey, change.data);
					}
					break;

				case 'delete': {
					const keyToDelete = Array.from(result.keys()).find((k) => k.toLowerCase() === entityId.toLowerCase());
					if (keyToDelete) result.delete(keyToDelete);
					break;
				}
			}
		}

		return Array.from(result.values());
	}

	async loadMaterials(brandId: string): Promise<Material[]> {
		let baseMaterials: Material[] = [];
		const brandPath = `brands/${brandId}`;

		if (!this.isLocalCreate(brandPath)) {
			const response = await apiFetch(`/api/brands/${brandId}/materials`);
			if (response.ok) {
				baseMaterials = await response.json();
			} else {
				throw new Error(`Failed to load materials: ${response.statusText}`);
			}
		}

		return this.layerMaterialChanges(baseMaterials, brandId);
	}

	/**
	 * Get the original (pre-change) material data for a brand/materialType.
	 */
	getOriginalMaterial(brandId: string, materialType: string): Material | null {
		if (!get(useChangeTracking)) return null;

		const changeSet = get(changeStore);
		const materialPrefix = `brands/${brandId}/materials/`;

		for (const { entityId, change } of this.getDirectChildChanges(changeSet, materialPrefix)) {
			if (change.data?.materialType?.toUpperCase() === materialType.toUpperCase()) {
				return change.originalData || null;
			}
			if (entityId.toLowerCase() === materialType.toLowerCase()) {
				return change.originalData || null;
			}
		}

		return null;
	}

	async getMaterial(brandId: string, materialType: string): Promise<Material | null> {
		const entityPath = `brands/${brandId}/materials/${materialType}`;
		const materialPrefix = `brands/${brandId}/materials/`;

		if (get(useChangeTracking)) {
			const changeSet = get(changeStore);

			// First check exact path match
			let change = changeSet._index.get(entityPath)?.change;

			// If not found, scan for renamed material
			if (!change) {
				for (const { change: c } of this.getDirectChildChanges(changeSet, materialPrefix)) {
					if (c.data?.materialType?.toUpperCase() === materialType.toUpperCase()) {
						change = c;
						break;
					}
				}
			}

			if (change) {
				if (change.operation === 'create' || change.operation === 'update') return change.data || null;
				if (change.operation === 'delete') return null;
			}

			if (this.isLocalCreate(`brands/${brandId}`)) return null;
		}

		const response = await apiFetch(`/api/brands/${brandId}/materials/${materialType.toLowerCase()}`);
		if (!response.ok) return null;
		const baseMaterial = await response.json();
		if (baseMaterial.error) return null;

		return this.getEntityWithChanges(baseMaterial, entityPath);
	}

	/**
	 * Save a material (custom: complex rename path-finding).
	 */
	async saveMaterial(brandId: string, materialType: string, material: Material, oldMaterial?: Material): Promise<boolean> {
		try {
			const newMaterialType = material.materialType || materialType;
			const newPath = `brands/${brandId}/materials/${newMaterialType}`;

			if (get(useChangeTracking)) {
				const changeSet = get(changeStore);
				const materialPrefix = `brands/${brandId}/materials/`;

				// Find existing change for this material
				let existingPath: string | undefined;
				let trueOriginalData = oldMaterial;

				if (oldMaterial) {
					const oldKey = (oldMaterial.slug || oldMaterial.materialType || oldMaterial.material || '').toLowerCase();
					for (const { change } of this.getDirectChildChanges(changeSet, materialPrefix)) {
						const origData = change.originalData;
						if (origData) {
							const origKey = (origData.slug || origData.materialType || origData.material || '').toLowerCase();
							if (origKey === oldKey) {
								existingPath = change.entity.path;
								trueOriginalData = origData;
								break;
							}
						}
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

			const response = await apiFetch(`/api/brands/${brandId}/materials/${newMaterialType}`, {
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

	async createMaterial(brandId: string, material: Material): Promise<{ success: boolean; materialType?: string }> {
		const materialType = material.materialType ||
			material.material.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
		const data = { ...material, id: materialType, materialType };
		return this._createEntity(
			'material',
			`brands/${brandId}/materials/${materialType}`,
			`/api/brands/${brandId}/materials`,
			materialType, data, 'materialType'
		);
	}

	async deleteMaterial(brandId: string, materialType: string, material?: Material): Promise<boolean> {
		return this._deleteEntity(
			'material',
			`brands/${brandId}/materials/${materialType}`,
			`brands/${brandId}/materials/`,
			`/api/brands/${brandId}/materials/${materialType}`,
			materialType, material,
			['materialType', 'material']
		);
	}

	// ============================================
	// Filament methods
	// ============================================

	async loadFilaments(brandId: string, materialType: string): Promise<Filament[]> {
		const apiMT = this.getApiMaterialType(brandId, materialType);
		const materialPath = `brands/${brandId}/materials/${materialType}`;
		const items = await this._loadCollection<Filament>(
			`/api/brands/${brandId}/materials/${apiMT}/filaments`,
			`${materialPath}/filaments/`,
			'slug' as keyof Filament,
			materialPath
		);
		// Ensure slug is set (cloud API may only have id from static JSON)
		for (const f of items) {
			if (!f.slug && f.id) f.slug = f.id;
		}
		return items;
	}

	async getFilament(brandId: string, materialType: string, filamentId: string): Promise<Filament | null> {
		const apiMT = this.getApiMaterialType(brandId, materialType);
		return this._getEntity<Filament>(
			`brands/${brandId}/materials/${materialType}/filaments/${filamentId}`,
			`/api/brands/${brandId}/materials/${apiMT}/filaments/${filamentId}`,
			(data) => `brands/${brandId}/materials/${materialType}/filaments/${data.slug || data.id}`
		);
	}

	async saveFilament(
		brandId: string, materialType: string, filamentId: string,
		filament: Filament, oldFilament?: Filament
	): Promise<boolean> {
		const basePath = `brands/${brandId}/materials/${materialType}/filaments`;
		return this._saveEntity(
			'filament',
			`${basePath}/${filamentId}`,
			`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}`,
			filamentId, filament, oldFilament,
			oldFilament ? (old) => `${basePath}/${old.slug || old.id}` : undefined
		);
	}

	async createFilament(
		brandId: string, materialType: string, filament: Filament
	): Promise<{ success: boolean; filamentId?: string }> {
		const filamentId = filament.slug || filament.id ||
			filament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		const data = { ...filament, id: filamentId, slug: filamentId };
		return this._createEntity(
			'filament',
			`brands/${brandId}/materials/${materialType}/filaments/${filamentId}`,
			`/api/brands/${brandId}/materials/${materialType}/filaments`,
			filamentId, data, 'filamentId'
		);
	}

	async deleteFilament(
		brandId: string, materialType: string, filamentId: string, filament?: Filament
	): Promise<boolean> {
		const basePath = `brands/${brandId}/materials/${materialType}/filaments`;
		return this._deleteEntity(
			'filament', `${basePath}/${filamentId}`, `${basePath}/`,
			`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}`,
			filamentId, filament
		);
	}

	// ============================================
	// Variant methods
	// ============================================

	async loadVariants(brandId: string, materialType: string, filamentId: string): Promise<Variant[]> {
		const apiMT = this.getApiMaterialType(brandId, materialType);
		const filamentPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;
		const items = await this._loadCollection<Variant>(
			`/api/brands/${brandId}/materials/${apiMT}/filaments/${filamentId}/variants`,
			`${filamentPath}/variants/`,
			'slug' as keyof Variant,
			filamentPath
		);
		for (const v of items) {
			if (!v.slug && v.id) v.slug = v.id;
		}
		return items;
	}

	async getVariant(
		brandId: string, materialType: string, filamentId: string, variantSlug: string
	): Promise<Variant | null> {
		const apiMT = this.getApiMaterialType(brandId, materialType);
		const basePath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants`;
		return this._getEntity<Variant>(
			`${basePath}/${variantSlug}`,
			`/api/brands/${brandId}/materials/${apiMT}/filaments/${filamentId}/variants/${variantSlug}`,
			(data) => `${basePath}/${data.slug}`
		);
	}

	async saveVariant(
		brandId: string, materialType: string, filamentId: string,
		variantSlug: string, variant: Variant, oldVariant?: Variant
	): Promise<boolean> {
		const basePath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants`;
		return this._saveEntity(
			'variant',
			`${basePath}/${variantSlug}`,
			`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`,
			variantSlug, variant, oldVariant,
			oldVariant ? (old) => `${basePath}/${old.slug || old.id}` : undefined
		);
	}

	async createVariant(
		brandId: string, materialType: string, filamentId: string, variant: Variant
	): Promise<{ success: boolean; variantSlug?: string }> {
		const variantSlug = variant.slug || variant.id ||
			variant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		const data = { ...variant, id: variantSlug, slug: variantSlug, filament_id: filamentId };
		const basePath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants`;
		return this._createEntity(
			'variant', `${basePath}/${variantSlug}`,
			`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants`,
			variantSlug, data, 'variantSlug'
		);
	}

	async deleteVariant(
		brandId: string, materialType: string, filamentId: string,
		variantSlug: string, variant?: Variant
	): Promise<boolean> {
		const basePath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants`;
		return this._deleteEntity(
			'variant', `${basePath}/${variantSlug}`, `${basePath}/`,
			`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`,
			variantSlug, variant
		);
	}

	// ============================================
	// Cache
	// ============================================

	clearCache() {
		this.index = null;
	}
}

export const db = DatabaseService.getInstance();
