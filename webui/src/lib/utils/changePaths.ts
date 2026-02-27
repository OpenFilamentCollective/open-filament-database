/**
 * Path Utilities for Change Tree
 *
 * Single source of truth for path construction, parsing, and tree traversal.
 * Replaces scattered string concatenation across database.ts and other files.
 */

import type { EntityPath } from '$lib/types/changeTree';
import type { EntityIdentifier, EntityType } from '$lib/types/changes';

/**
 * Build a canonical path string from typed path segments.
 */
export function buildPath(ep: EntityPath): string {
	switch (ep.type) {
		case 'store':
			return `stores/${ep.storeId}`;
		case 'brand':
			return `brands/${ep.brandId}`;
		case 'material':
			return `brands/${ep.brandId}/materials/${ep.materialType}`;
		case 'filament':
			return `brands/${ep.brandId}/materials/${ep.materialType}/filaments/${ep.filamentId}`;
		case 'variant':
			return `brands/${ep.brandId}/materials/${ep.materialType}/filaments/${ep.filamentId}/variants/${ep.variantSlug}`;
	}
}

/**
 * Parse a path string back into typed segments.
 * Returns null if the path does not match any known pattern.
 */
export function parsePath(path: string): EntityPath | null {
	const parts = path.split('/');

	if (parts[0] === 'stores' && parts.length === 2) {
		return { type: 'store', storeId: parts[1] };
	}

	if (parts[0] === 'brands') {
		if (parts.length === 2) {
			return { type: 'brand', brandId: parts[1] };
		}
		if (parts.length === 4 && parts[2] === 'materials') {
			return { type: 'material', brandId: parts[1], materialType: parts[3] };
		}
		if (parts.length === 6 && parts[2] === 'materials' && parts[4] === 'filaments') {
			return {
				type: 'filament',
				brandId: parts[1],
				materialType: parts[3],
				filamentId: parts[5]
			};
		}
		if (
			parts.length === 8 &&
			parts[2] === 'materials' &&
			parts[4] === 'filaments' &&
			parts[6] === 'variants'
		) {
			return {
				type: 'variant',
				brandId: parts[1],
				materialType: parts[3],
				filamentId: parts[5],
				variantSlug: parts[7]
			};
		}
	}

	return null;
}

/**
 * Get the segments needed to traverse the tree from root to this entity.
 *
 * Example: "brands/prusament/materials/PLA"
 *   => { root: 'brands', segments: ['prusament', 'materials', 'PLA'] }
 *   (traversal: tree.brands['prusament'].children['materials'].children['PLA'])
 */
export function getTreeSegments(ep: EntityPath): {
	root: 'stores' | 'brands';
	segments: string[];
} {
	switch (ep.type) {
		case 'store':
			return { root: 'stores', segments: [ep.storeId] };
		case 'brand':
			return { root: 'brands', segments: [ep.brandId] };
		case 'material':
			return { root: 'brands', segments: [ep.brandId, 'materials', ep.materialType] };
		case 'filament':
			return {
				root: 'brands',
				segments: [ep.brandId, 'materials', ep.materialType, 'filaments', ep.filamentId]
			};
		case 'variant':
			return {
				root: 'brands',
				segments: [
					ep.brandId,
					'materials',
					ep.materialType,
					'filaments',
					ep.filamentId,
					'variants',
					ep.variantSlug
				]
			};
	}
}

/**
 * Get the parent EntityPath for a given path.
 * Returns null for top-level entities (stores, brands).
 */
export function getParentPath(ep: EntityPath): EntityPath | null {
	switch (ep.type) {
		case 'store':
		case 'brand':
			return null;
		case 'material':
			return { type: 'brand', brandId: ep.brandId };
		case 'filament':
			return { type: 'material', brandId: ep.brandId, materialType: ep.materialType };
		case 'variant':
			return {
				type: 'filament',
				brandId: ep.brandId,
				materialType: ep.materialType,
				filamentId: ep.filamentId
			};
	}
}

/**
 * Build an EntityIdentifier from an EntityPath (for backward compat with EntityChange).
 */
export function toEntityIdentifier(ep: EntityPath): EntityIdentifier {
	const path = buildPath(ep);

	const typeMap: Record<EntityPath['type'], EntityType> = {
		store: 'store',
		brand: 'brand',
		material: 'material',
		filament: 'filament',
		variant: 'variant'
	};

	let id: string;
	switch (ep.type) {
		case 'store':
			id = ep.storeId;
			break;
		case 'brand':
			id = ep.brandId;
			break;
		case 'material':
			id = ep.materialType;
			break;
		case 'filament':
			id = ep.filamentId;
			break;
		case 'variant':
			id = ep.variantSlug;
			break;
	}

	return { type: typeMap[ep.type], path, id };
}

/**
 * Get the namespace key for a child entity type.
 * Used when navigating the tree to find children.
 */
export function childNamespace(
	childType: 'material' | 'filament' | 'variant'
): 'materials' | 'filaments' | 'variants' {
	switch (childType) {
		case 'material':
			return 'materials';
		case 'filament':
			return 'filaments';
		case 'variant':
			return 'variants';
	}
}
