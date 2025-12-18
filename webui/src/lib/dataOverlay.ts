/**
 * Data Overlay System
 *
 * Merges local changes from localStorage on top of server data,
 * allowing users to see their pending changes as if they were already saved.
 */

import {
	getChangeByOriginalPath,
	getChanges,
	getNewPathForOriginal,
	getOriginalPathForNew,
	type Change
} from './stores/changes.svelte';
import type { Brand, Material, Filament, Variant, FilamentSize, Store } from './schemas/generated';

export interface OverlayResult<T> {
	data: T;
	hasLocalChanges: boolean;
	change?: Change;
}

/**
 * Build the original path for an entity based on its location in the hierarchy
 */
export function buildOriginalPath(
	type: 'brand' | 'material' | 'filament' | 'variant' | 'sizes' | 'store',
	nameOrBrand: string,
	materialName?: string,
	filamentName?: string,
	variantName?: string
): string {
	switch (type) {
		case 'brand':
			return `${nameOrBrand}/brand.json`;
		case 'material':
			return `${nameOrBrand}/${materialName}/material.json`;
		case 'filament':
			return `${nameOrBrand}/${materialName}/${filamentName}/filament.json`;
		case 'variant':
			return `${nameOrBrand}/${materialName}/${filamentName}/${variantName}/variant.json`;
		case 'sizes':
			return `${nameOrBrand}/${materialName}/${filamentName}/${variantName}/sizes.json`;
		case 'store':
			return `stores/${nameOrBrand}/store.json`;
	}
}

/**
 * Apply local changes to brand data
 */
export function overlayBrand(serverData: Brand, brandName: string): OverlayResult<Brand> {
	const path = buildOriginalPath('brand', brandName);
	const change = getChangeByOriginalPath(path);

	if (change && change.operation !== 'delete') {
		return {
			data: { ...serverData, ...change.data } as Brand,
			hasLocalChanges: true,
			change
		};
	}

	return { data: serverData, hasLocalChanges: false };
}

/**
 * Apply local changes to store data
 */
export function overlayStore(serverData: Store, storeId: string): OverlayResult<Store> {
	const path = buildOriginalPath('store', storeId);
	const change = getChangeByOriginalPath(path);

	if (change && change.operation !== 'delete') {
		return {
			data: { ...serverData, ...change.data } as Store,
			hasLocalChanges: true,
			change
		};
	}

	return { data: serverData, hasLocalChanges: false };
}

/**
 * Apply local changes to material data
 */
export function overlayMaterial(
	serverData: Material,
	brandName: string,
	materialName: string
): OverlayResult<Material> {
	const path = buildOriginalPath('material', brandName, materialName);
	const change = getChangeByOriginalPath(path);

	if (change && change.operation !== 'delete') {
		return {
			data: { ...serverData, ...change.data } as Material,
			hasLocalChanges: true,
			change
		};
	}

	return { data: serverData, hasLocalChanges: false };
}

/**
 * Apply local changes to filament data
 */
export function overlayFilament(
	serverData: Filament,
	brandName: string,
	materialName: string,
	filamentName: string
): OverlayResult<Filament> {
	const path = buildOriginalPath('filament', brandName, materialName, filamentName);
	const change = getChangeByOriginalPath(path);

	if (change && change.operation !== 'delete') {
		return {
			data: { ...serverData, ...change.data } as Filament,
			hasLocalChanges: true,
			change
		};
	}

	return { data: serverData, hasLocalChanges: false };
}

/**
 * Apply local changes to variant data
 */
export function overlayVariant(
	serverData: Variant,
	brandName: string,
	materialName: string,
	filamentName: string,
	variantName: string
): OverlayResult<Variant> {
	const path = buildOriginalPath('variant', brandName, materialName, filamentName, variantName);
	const change = getChangeByOriginalPath(path);

	if (change && change.operation !== 'delete') {
		return {
			data: { ...serverData, ...change.data } as Variant,
			hasLocalChanges: true,
			change
		};
	}

	return { data: serverData, hasLocalChanges: false };
}

/**
 * Apply local changes to sizes data
 */
export function overlaySizes(
	serverData: FilamentSize[],
	brandName: string,
	materialName: string,
	filamentName: string,
	variantName: string
): OverlayResult<FilamentSize[]> {
	const path = buildOriginalPath('sizes', brandName, materialName, filamentName, variantName);
	const change = getChangeByOriginalPath(path);

	if (change && change.operation !== 'delete') {
		return {
			data: change.data as unknown as FilamentSize[],
			hasLocalChanges: true,
			change
		};
	}

	return { data: serverData, hasLocalChanges: false };
}

/**
 * Check if a URL path should redirect due to a rename
 * Returns the new URL path if a redirect is needed, undefined otherwise
 */
export function checkForRenameRedirect(
	type: 'brand' | 'material' | 'filament' | 'variant',
	brandName: string,
	materialName?: string,
	filamentName?: string,
	variantName?: string
): string | undefined {
	const originalPath = buildOriginalPath(type, brandName, materialName, filamentName, variantName);
	const newPath = getNewPathForOriginal(originalPath);

	if (newPath && newPath !== originalPath) {
		// Extract the new name from the path
		const parts = newPath.split('/');
		switch (type) {
			case 'brand':
				return `/brands/${encodeURIComponent(parts[0])}`;
			case 'material':
				return `/brands/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
			case 'filament':
				return `/brands/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[2])}`;
			case 'variant':
				return `/brands/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[2])}/${encodeURIComponent(parts[3])}`;
		}
	}

	return undefined;
}

/**
 * Check if a URL path points to a renamed item (new name that doesn't exist in DB)
 * Returns the original path segments if this is accessing a renamed item
 */
export function resolveRenamedPath(
	type: 'brand' | 'material' | 'filament' | 'variant',
	brandName: string,
	materialName?: string,
	filamentName?: string,
	variantName?: string
): { originalBrand: string; originalMaterial?: string; originalFilament?: string; originalVariant?: string } | undefined {
	// Build what would be the path if these names were real
	const testPath = buildOriginalPath(type, brandName, materialName, filamentName, variantName);

	// Check if this path is actually the result of a rename
	const originalPath = getOriginalPathForNew(testPath);

	if (originalPath) {
		const parts = originalPath.split('/');
		return {
			originalBrand: parts[0],
			originalMaterial: parts[1],
			originalFilament: parts[2],
			originalVariant: parts[3]
		};
	}

	return undefined;
}

/**
 * Get the effective name for display (after local changes)
 */
export function getEffectiveName(
	type: 'brand' | 'material' | 'filament' | 'variant',
	originalName: string,
	brandName: string,
	materialName?: string,
	filamentName?: string
): string {
	const path = buildOriginalPath(type, brandName, materialName, filamentName, originalName);
	const change = getChangeByOriginalPath(path);

	if (change && change.operation !== 'delete') {
		switch (type) {
			case 'brand':
				return (change.data.brand as string) || originalName;
			case 'material':
				return (change.data.material as string) || originalName;
			case 'filament':
				return (change.data.name as string) || originalName;
			case 'variant':
				return (change.data.color_name as string) || originalName;
		}
	}

	return originalName;
}

/**
 * Get the effective URL for an entity (considering renames)
 */
export function getEffectiveUrl(
	type: 'brand' | 'material' | 'filament' | 'variant',
	brandName: string,
	materialName?: string,
	filamentName?: string,
	variantName?: string
): string {
	const path = buildOriginalPath(type, brandName, materialName, filamentName, variantName);
	const newPath = getNewPathForOriginal(path);

	if (newPath) {
		const parts = newPath.split('/');
		switch (type) {
			case 'brand':
				return `/brands/${encodeURIComponent(parts[0])}`;
			case 'material':
				return `/brands/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
			case 'filament':
				return `/brands/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[2])}`;
			case 'variant':
				return `/brands/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[2])}/${encodeURIComponent(parts[3])}`;
		}
	}

	// No rename, use original names
	switch (type) {
		case 'brand':
			return `/brands/${encodeURIComponent(brandName)}`;
		case 'material':
			return `/brands/${encodeURIComponent(brandName)}/${encodeURIComponent(materialName!)}`;
		case 'filament':
			return `/brands/${encodeURIComponent(brandName)}/${encodeURIComponent(materialName!)}/${encodeURIComponent(filamentName!)}`;
		case 'variant':
			return `/brands/${encodeURIComponent(brandName)}/${encodeURIComponent(materialName!)}/${encodeURIComponent(filamentName!)}/${encodeURIComponent(variantName!)}`;
	}
}

/**
 * Check if an entity has been deleted locally
 */
export function isDeletedLocally(
	type: 'brand' | 'material' | 'filament' | 'variant' | 'sizes',
	brandName: string,
	materialName?: string,
	filamentName?: string,
	variantName?: string
): boolean {
	const path = buildOriginalPath(type, brandName, materialName, filamentName, variantName);
	const change = getChangeByOriginalPath(path);
	return change?.operation === 'delete';
}

/**
 * Get all local changes for display purposes
 */
export function getLocalChangeSummary(): {
	creates: Change[];
	updates: Change[];
	deletes: Change[];
	renames: Change[];
} {
	const all = getChanges();
	return {
		creates: all.filter((c) => c.operation === 'create'),
		updates: all.filter((c) => c.operation === 'update' && c.path === c.originalPath),
		deletes: all.filter((c) => c.operation === 'delete'),
		renames: all.filter((c) => c.path !== c.originalPath && c.operation !== 'delete')
	};
}
