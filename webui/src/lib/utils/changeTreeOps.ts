/**
 * Tree CRUD Operations
 *
 * Pure functions for manipulating the change tree.
 * These replace the O(n) prefix-scanning operations in the flat change map.
 */

import type {
	ChangeTree,
	ChangeTreeNode,
	TreeChangeSet,
	EntityPath,
	SerializedTreeChangeSet
} from '$lib/types/changeTree';
import type { EntityChange, ImageReference } from '$lib/types/changes';
import { buildPath, parsePath, getTreeSegments } from './changePaths';

// ============ Tree Navigation ============

/**
 * Get a node from the tree by EntityPath.
 * Returns undefined if the node does not exist.
 *
 * Complexity: O(depth) where depth <= 7 => effectively O(1)
 */
export function getNode(tree: ChangeTree, ep: EntityPath): ChangeTreeNode | undefined {
	const { root, segments } = getTreeSegments(ep);
	let current: Record<string, ChangeTreeNode> = tree[root];

	for (let i = 0; i < segments.length; i++) {
		const node = current[segments[i]];
		if (!node) return undefined;
		if (i === segments.length - 1) return node;
		current = node.children;
	}

	return undefined;
}

/**
 * Get an EntityChange by path string via the flat index. O(1).
 */
export function getChange(
	changeSet: TreeChangeSet,
	path: string
): EntityChange | undefined {
	return changeSet._index.get(path)?.change;
}

/**
 * Ensure a node exists at the given path, creating structural intermediates as needed.
 * Returns the node at the target path.
 *
 * Complexity: O(depth) => effectively O(1)
 */
export function ensureNode(changeSet: TreeChangeSet, ep: EntityPath): ChangeTreeNode {
	const { root, segments } = getTreeSegments(ep);
	let current: Record<string, ChangeTreeNode> = changeSet.tree[root];
	let pathSoFar = root;

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		pathSoFar += '/' + seg;

		if (!current[seg]) {
			const newNode: ChangeTreeNode = {
				key: seg,
				path: pathSoFar,
				children: {}
			};
			current[seg] = newNode;
			changeSet._index.set(pathSoFar, newNode);
		}

		if (i === segments.length - 1) {
			return current[seg];
		}
		current = current[seg].children;
	}

	// Should never reach here (segments always has at least 1 element)
	throw new Error(`Failed to ensure node for path: ${buildPath(ep)}`);
}

/**
 * Set a change on a tree node (ensures the node exists first).
 */
export function setChange(
	changeSet: TreeChangeSet,
	ep: EntityPath,
	change: EntityChange
): void {
	const node = ensureNode(changeSet, ep);
	node.change = change;
}

/**
 * Remove a change from a node. If the node becomes empty (no change, no children),
 * prune it and any empty ancestors from the tree.
 */
export function removeChange(changeSet: TreeChangeSet, ep: EntityPath): void {
	const node = getNode(changeSet.tree, ep);
	if (!node) return;

	delete node.change;

	// If no children remain, prune this node from its parent
	if (Object.keys(node.children).length === 0) {
		pruneEmptyNode(changeSet, ep);
	}
}

/**
 * Remove an empty node from its parent and recursively prune empty ancestors.
 */
function pruneEmptyNode(changeSet: TreeChangeSet, ep: EntityPath): void {
	const { root, segments } = getTreeSegments(ep);
	const fullPath = buildPath(ep);

	changeSet._index.delete(fullPath);

	if (segments.length === 1) {
		// Direct child of root namespace
		delete changeSet.tree[root][segments[0]];
		return;
	}

	// Walk to the parent and remove this child
	let current: Record<string, ChangeTreeNode> = changeSet.tree[root];
	const parentSegments: Array<{ container: Record<string, ChangeTreeNode>; key: string }> = [];

	for (let i = 0; i < segments.length - 1; i++) {
		const node = current[segments[i]];
		if (!node) return;
		parentSegments.push({ container: current, key: segments[i] });
		current = node.children;
	}

	// Remove the target node from its parent
	const targetKey = segments[segments.length - 1];
	delete current[targetKey];

	// Walk back up, pruning empty structural ancestors
	for (let i = parentSegments.length - 1; i >= 0; i--) {
		const { container, key } = parentSegments[i];
		const ancestor = container[key];
		if (
			ancestor &&
			!ancestor.change &&
			Object.keys(ancestor.children).length === 0
		) {
			changeSet._index.delete(ancestor.path);
			delete container[key];
		} else {
			break; // Stop pruning once we hit a non-empty ancestor
		}
	}
}

// ============ Child / Subtree Operations ============

/**
 * Get direct child nodes under a namespace segment.
 * For example: getDirectChildren(tree, brandEp, 'materials') returns all material nodes
 * for that brand.
 *
 * Complexity: O(k) where k = number of direct children
 * Replaces: O(n) prefix scan across ALL changes
 */
export function getDirectChildren(
	tree: ChangeTree,
	ep: EntityPath,
	namespace: string
): ChangeTreeNode[] {
	const node = getNode(tree, ep);
	if (!node) return [];

	const nsNode = node.children[namespace];
	if (!nsNode) return [];

	return Object.values(nsNode.children);
}

/**
 * Collect all changes from descendants of a node (not including the node itself).
 *
 * Complexity: O(d) where d = number of descendants
 */
export function collectDescendantChanges(node: ChangeTreeNode): EntityChange[] {
	const result: EntityChange[] = [];

	function walk(n: ChangeTreeNode) {
		for (const child of Object.values(n.children)) {
			if (child.change) {
				result.push(child.change);
			}
			walk(child);
		}
	}

	walk(node);
	return result;
}

/**
 * Check if any descendant of a node has a change (not including the node itself).
 * Short-circuits on the first descendant change found.
 *
 * Complexity: O(d) worst case, but typically returns early when a change exists.
 */
export function hasDescendantChanges(node: ChangeTreeNode): boolean {
	for (const child of Object.values(node.children)) {
		if (child.change) return true;
		if (hasDescendantChanges(child)) return true;
	}
	return false;
}

/**
 * Remove all descendants of a node (not the node itself) from the tree and index.
 * Returns all removed EntityChange objects (useful for image cleanup).
 *
 * Complexity: O(d) where d = number of descendants
 * Replaces: cleanupChildChanges (O(n) scan of all changes)
 */
export function removeDescendants(
	changeSet: TreeChangeSet,
	ep: EntityPath
): EntityChange[] {
	const node = getNode(changeSet.tree, ep);
	if (!node) return [];

	const removed: EntityChange[] = [];

	function collectAndRemoveFromIndex(n: ChangeTreeNode) {
		if (n.change) {
			removed.push(n.change);
		}
		changeSet._index.delete(n.path);
		for (const child of Object.values(n.children)) {
			collectAndRemoveFromIndex(child);
		}
	}

	// Process all children (not the node itself)
	for (const child of Object.values(node.children)) {
		collectAndRemoveFromIndex(child);
	}

	// Clear children
	node.children = {};

	return removed;
}

/**
 * Remove a node and all its descendants from the tree.
 * Returns all removed EntityChange objects.
 */
export function removeNodeAndDescendants(
	changeSet: TreeChangeSet,
	ep: EntityPath
): EntityChange[] {
	const node = getNode(changeSet.tree, ep);
	if (!node) return [];

	const removed: EntityChange[] = [];

	function collectAll(n: ChangeTreeNode) {
		if (n.change) {
			removed.push(n.change);
		}
		changeSet._index.delete(n.path);
		for (const child of Object.values(n.children)) {
			collectAll(child);
		}
	}

	collectAll(node);

	// Remove node from its parent
	pruneFromParent(changeSet, ep);

	return removed;
}

/**
 * Remove a node from its parent's children map (without touching descendants).
 */
function pruneFromParent(changeSet: TreeChangeSet, ep: EntityPath): void {
	const { root, segments } = getTreeSegments(ep);

	if (segments.length === 1) {
		delete changeSet.tree[root][segments[0]];
		return;
	}

	let current: Record<string, ChangeTreeNode> = changeSet.tree[root];
	for (let i = 0; i < segments.length - 1; i++) {
		const node = current[segments[i]];
		if (!node) return;
		if (i === segments.length - 2) {
			delete node.children[segments[segments.length - 1]];
			return;
		}
		current = node.children;
	}
}

/**
 * Move a subtree from oldPath to newPath (for entity renames).
 * Rewrites all paths in the subtree.
 *
 * Complexity: O(d) where d = number of descendants
 * Replaces: moveChange (O(n) prefix scan + rewrite)
 */
export function moveSubtree(
	changeSet: TreeChangeSet,
	oldEp: EntityPath,
	newEp: EntityPath,
	newEntity: { type: string; path: string; id: string }
): void {
	const oldPath = buildPath(oldEp);
	const newPath = buildPath(newEp);

	if (oldPath === newPath) return;

	const oldNode = getNode(changeSet.tree, oldEp);
	if (!oldNode || !oldNode.change) return;

	// Create the new node
	const newNode = ensureNode(changeSet, newEp);
	newNode.change = {
		...oldNode.change,
		entity: newEntity as any
	};

	// Recursively move children, rewriting paths
	function moveChildren(
		source: ChangeTreeNode,
		target: ChangeTreeNode,
		srcPrefix: string,
		dstPrefix: string
	) {
		for (const [key, child] of Object.entries(source.children)) {
			const oldChildPath = child.path;
			const newChildPath = dstPrefix + oldChildPath.slice(srcPrefix.length);

			const newChild: ChangeTreeNode = {
				key: child.key,
				path: newChildPath,
				children: {}
			};

			if (child.change) {
				newChild.change = {
					...child.change,
					entity: {
						...child.change.entity,
						path: newChildPath
					}
				};
			}

			target.children[key] = newChild;
			changeSet._index.set(newChildPath, newChild);
			changeSet._index.delete(oldChildPath);

			// Recurse
			moveChildren(child, newChild, srcPrefix, dstPrefix);
		}
	}

	moveChildren(oldNode, newNode, oldPath, newPath);

	// Remove the old node from its parent and index
	changeSet._index.delete(oldPath);
	pruneFromParent(changeSet, oldEp);
}

// ============ Iteration ============

/**
 * Get all changes as a flat array (for export, summary, changesList).
 */
export function getAllChanges(tree: ChangeTree): EntityChange[] {
	const result: EntityChange[] = [];

	function walk(nodes: Record<string, ChangeTreeNode>) {
		for (const node of Object.values(nodes)) {
			if (node.change) {
				result.push(node.change);
			}
			walk(node.children);
		}
	}

	walk(tree.stores);
	walk(tree.brands);
	return result;
}

/**
 * Count all changes in the tree.
 */
export function countChanges(tree: ChangeTree): number {
	let count = 0;
	function walk(nodes: Record<string, ChangeTreeNode>) {
		for (const node of Object.values(nodes)) {
			if (node.change) count++;
			walk(node.children);
		}
	}
	walk(tree.stores);
	walk(tree.brands);
	return count;
}

// ============ Serialization ============

/**
 * Rebuild the flat index from the tree.
 * Called after deserialization from localStorage.
 */
export function rebuildIndex(tree: ChangeTree): Map<string, ChangeTreeNode> {
	const index = new Map<string, ChangeTreeNode>();

	function walk(nodes: Record<string, ChangeTreeNode>) {
		for (const node of Object.values(nodes)) {
			index.set(node.path, node);
			walk(node.children);
		}
	}

	walk(tree.stores);
	walk(tree.brands);
	return index;
}

/**
 * Create an empty TreeChangeSet.
 */
export function createEmptyChangeSet(): TreeChangeSet {
	return {
		tree: { stores: {}, brands: {} },
		_index: new Map(),
		images: {},
		lastModified: Date.now(),
		version: 2
	};
}

/**
 * Serialize a TreeChangeSet for localStorage (strips the _index Map).
 */
export function serialize(changeSet: TreeChangeSet): SerializedTreeChangeSet {
	return {
		tree: changeSet.tree,
		images: changeSet.images,
		lastModified: changeSet.lastModified,
		version: 2
	};
}

/**
 * Deserialize from localStorage, rebuilding the index.
 */
export function deserialize(data: SerializedTreeChangeSet): TreeChangeSet {
	return {
		tree: data.tree,
		_index: rebuildIndex(data.tree),
		images: data.images,
		lastModified: data.lastModified,
		version: 2
	};
}

// ============ Image Helpers ============

/**
 * Find all image references belonging to an entity path or its descendants.
 * Used for cleanup when deleting/removing an entity.
 */
export function findImagesForEntity(
	images: Record<string, ImageReference>,
	entityPath: string
): string[] {
	const pathPrefix = entityPath + '/';
	const imageIds: string[] = [];

	for (const [imageId, imageRef] of Object.entries(images)) {
		if (imageRef.entityPath === entityPath || imageRef.entityPath.startsWith(pathPrefix)) {
			imageIds.push(imageId);
		}
	}

	return imageIds;
}

/**
 * Update image references when an entity is moved/renamed.
 */
export function moveImageReferences(
	images: Record<string, ImageReference>,
	oldPath: string,
	newPath: string
): void {
	const oldPrefix = oldPath + '/';
	const newPrefix = newPath + '/';

	for (const [imageId, imageRef] of Object.entries(images)) {
		if (imageRef.entityPath === oldPath) {
			images[imageId] = { ...imageRef, entityPath: newPath };
		} else if (imageRef.entityPath.startsWith(oldPrefix)) {
			images[imageId] = {
				...imageRef,
				entityPath: newPrefix + imageRef.entityPath.slice(oldPrefix.length)
			};
		}
	}
}
