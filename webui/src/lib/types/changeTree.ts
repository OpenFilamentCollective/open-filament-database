/**
 * Tree-based change tracking types
 *
 * Replaces the flat Record<string, EntityChange> with a hierarchical tree
 * that mirrors the entity structure: brands -> materials -> filaments -> variants.
 *
 * Benefits:
 * - Child/descendant operations are O(subtree) instead of O(all changes)
 * - Path construction is centralized and type-safe via EntityPath
 * - Parent-child relationships are structurally enforced
 */

import type { EntityChange, ImageReference } from './changes';

/**
 * A node in the change tree.
 * Each node can optionally hold an EntityChange.
 * Nodes without a change are structural containers (e.g., namespace segments like "materials").
 */
export interface ChangeTreeNode {
	/** The segment key for this node (e.g., "prusament", "PLA", "materials") */
	key: string;

	/** The full entity path from root (e.g., "brands/prusament/materials/PLA") */
	path: string;

	/** The entity change at this node, if any */
	change?: EntityChange;

	/**
	 * Child nodes keyed by their segment key.
	 *
	 * Tree structure with namespace segments:
	 *   brands["prusament"]
	 *     .children["materials"]
	 *       .children["PLA"]
	 *         .children["filaments"]
	 *           .children["pla-basic"]
	 *             .children["variants"]
	 *               .children["red"]
	 */
	children: Record<string, ChangeTreeNode>;
}

/**
 * Root container for the change tree.
 */
export interface ChangeTree {
	/** Top-level store nodes (stores have no children) */
	stores: Record<string, ChangeTreeNode>;

	/** Top-level brand nodes (with nested materials/filaments/variants) */
	brands: Record<string, ChangeTreeNode>;
}

/**
 * The tree-based ChangeSet, replacing the flat Record<string, EntityChange>.
 *
 * The `tree` is the source of truth.
 * The `_index` is a derived flat Map rebuilt on deserialization for O(1) path lookups.
 */
export interface TreeChangeSet {
	/** The hierarchical tree of changes */
	tree: ChangeTree;

	/** Flat index: path -> ChangeTreeNode (NOT serialized to localStorage) */
	_index: Map<string, ChangeTreeNode>;

	/** Image references stored separately (unchanged from v1) */
	images: Record<string, ImageReference>;

	/** Last modified timestamp */
	lastModified: number;

	/** Schema version for migration detection */
	version: 2;
}

/**
 * Serialized form for localStorage (no Map).
 */
export interface SerializedTreeChangeSet {
	tree: ChangeTree;
	images: Record<string, ImageReference>;
	lastModified: number;
	version: 2;
}

// ============ Typed Entity Paths ============

export interface StorePath {
	type: 'store';
	storeId: string;
}

export interface BrandPath {
	type: 'brand';
	brandId: string;
}

export interface MaterialPath {
	type: 'material';
	brandId: string;
	materialType: string;
}

export interface FilamentPath {
	type: 'filament';
	brandId: string;
	materialType: string;
	filamentId: string;
}

export interface VariantPath {
	type: 'variant';
	brandId: string;
	materialType: string;
	filamentId: string;
	variantSlug: string;
}

/** Discriminated union of all entity path types */
export type EntityPath = StorePath | BrandPath | MaterialPath | FilamentPath | VariantPath;
