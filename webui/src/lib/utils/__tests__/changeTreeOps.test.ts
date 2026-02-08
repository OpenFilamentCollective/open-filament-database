import { describe, it, expect, beforeEach } from 'vitest';
import {
	getNode,
	getChange,
	ensureNode,
	setChange,
	removeChange,
	getDirectChildren,
	collectDescendantChanges,
	hasDescendantChanges,
	removeDescendants,
	moveSubtree,
	getAllChanges,
	countChanges,
	rebuildIndex,
	createEmptyChangeSet,
	serialize,
	deserialize,
	findImagesForEntity,
	moveImageReferences
} from '../changeTreeOps';
import { buildPath } from '../changePaths';
import type { TreeChangeSet } from '$lib/types/changeTree';
import type { EntityChange } from '$lib/types/changes';

function makeChange(path: string, operation: 'create' | 'update' | 'delete', data?: any): EntityChange {
	const parts = path.split('/');
	const type = parts[0] === 'stores' ? 'store' : parts.length <= 2 ? 'brand' : parts[parts.length - 2] === 'materials' ? 'material' : parts[parts.length - 2] === 'filaments' ? 'filament' : 'variant';
	return {
		entity: { type: type as any, path, id: parts[parts.length - 1] },
		operation,
		data,
		timestamp: Date.now(),
		description: `${operation} ${type}`
	};
}

describe('Tree Navigation', () => {
	let cs: TreeChangeSet;

	beforeEach(() => {
		cs = createEmptyChangeSet();
	});

	describe('ensureNode', () => {
		it('should create a store node', () => {
			const node = ensureNode(cs, { type: 'store', storeId: 'amazon' });
			expect(node.key).toBe('amazon');
			expect(node.path).toBe('stores/amazon');
			expect(node.children).toEqual({});
		});

		it('should create intermediate nodes for deep paths', () => {
			const node = ensureNode(cs, {
				type: 'variant',
				brandId: 'b',
				materialType: 'PLA',
				filamentId: 'f',
				variantSlug: 'red'
			});

			expect(node.path).toBe('brands/b/materials/PLA/filaments/f/variants/red');

			// Verify intermediate nodes exist
			expect(cs.tree.brands['b']).toBeDefined();
			expect(cs.tree.brands['b'].children['materials']).toBeDefined();
			expect(cs.tree.brands['b'].children['materials'].children['PLA']).toBeDefined();
			expect(
				cs.tree.brands['b'].children['materials'].children['PLA'].children['filaments']
			).toBeDefined();
			expect(
				cs.tree.brands['b'].children['materials'].children['PLA'].children['filaments']
					.children['f']
			).toBeDefined();
		});

		it('should add nodes to the index', () => {
			ensureNode(cs, { type: 'material', brandId: 'b', materialType: 'PLA' });

			expect(cs._index.has('brands/b')).toBe(true);
			expect(cs._index.has('brands/b/materials')).toBe(true);
			expect(cs._index.has('brands/b/materials/PLA')).toBe(true);
		});

		it('should not duplicate nodes', () => {
			const node1 = ensureNode(cs, { type: 'brand', brandId: 'b' });
			const node2 = ensureNode(cs, { type: 'brand', brandId: 'b' });
			expect(node1).toBe(node2);
		});
	});

	describe('getNode', () => {
		it('should find existing nodes', () => {
			setChange(
				cs,
				{ type: 'brand', brandId: 'b' },
				makeChange('brands/b', 'create', { name: 'B' })
			);

			const node = getNode(cs.tree, { type: 'brand', brandId: 'b' });
			expect(node).toBeDefined();
			expect(node!.change!.operation).toBe('create');
		});

		it('should return undefined for non-existent nodes', () => {
			const node = getNode(cs.tree, { type: 'brand', brandId: 'nonexistent' });
			expect(node).toBeUndefined();
		});
	});

	describe('getChange (index lookup)', () => {
		it('should find change by path string', () => {
			const change = makeChange('brands/b', 'create', { name: 'B' });
			setChange(cs, { type: 'brand', brandId: 'b' }, change);

			expect(getChange(cs, 'brands/b')).toBe(change);
		});

		it('should return undefined for missing path', () => {
			expect(getChange(cs, 'brands/nonexistent')).toBeUndefined();
		});
	});
});

describe('setChange / removeChange', () => {
	let cs: TreeChangeSet;

	beforeEach(() => {
		cs = createEmptyChangeSet();
	});

	it('should set and remove a change', () => {
		const ep = { type: 'brand' as const, brandId: 'b' };
		setChange(cs, ep, makeChange('brands/b', 'create'));

		expect(getChange(cs, 'brands/b')).toBeDefined();

		removeChange(cs, ep);
		expect(getChange(cs, 'brands/b')).toBeUndefined();
	});

	it('should prune empty nodes after removal', () => {
		const ep = { type: 'material' as const, brandId: 'b', materialType: 'PLA' };
		setChange(cs, ep, makeChange('brands/b/materials/PLA', 'create'));

		removeChange(cs, ep);

		// Brand node should be pruned since it has no change and no remaining children
		expect(cs.tree.brands['b']).toBeUndefined();
		expect(cs._index.has('brands/b')).toBe(false);
		expect(cs._index.has('brands/b/materials')).toBe(false);
		expect(cs._index.has('brands/b/materials/PLA')).toBe(false);
	});

	it('should not prune parent if it has its own change', () => {
		setChange(
			cs,
			{ type: 'brand', brandId: 'b' },
			makeChange('brands/b', 'update')
		);
		setChange(
			cs,
			{ type: 'material', brandId: 'b', materialType: 'PLA' },
			makeChange('brands/b/materials/PLA', 'create')
		);

		removeChange(cs, { type: 'material', brandId: 'b', materialType: 'PLA' });

		// Brand node should remain because it has its own change
		expect(getChange(cs, 'brands/b')).toBeDefined();
		expect(cs.tree.brands['b']).toBeDefined();
	});

	it('should not prune parent if it has other children with changes', () => {
		setChange(
			cs,
			{ type: 'material', brandId: 'b', materialType: 'PLA' },
			makeChange('brands/b/materials/PLA', 'create')
		);
		setChange(
			cs,
			{ type: 'material', brandId: 'b', materialType: 'PETG' },
			makeChange('brands/b/materials/PETG', 'create')
		);

		removeChange(cs, { type: 'material', brandId: 'b', materialType: 'PLA' });

		// Brand and materials namespace should remain
		expect(cs.tree.brands['b']).toBeDefined();
		expect(getChange(cs, 'brands/b/materials/PETG')).toBeDefined();
	});
});

describe('Child / Subtree Operations', () => {
	let cs: TreeChangeSet;

	beforeEach(() => {
		cs = createEmptyChangeSet();

		// Build a tree: brand -> 2 materials -> 1 filament each -> 1 variant
		setChange(
			cs,
			{ type: 'brand', brandId: 'b' },
			makeChange('brands/b', 'update', { name: 'Brand' })
		);
		setChange(
			cs,
			{ type: 'material', brandId: 'b', materialType: 'PLA' },
			makeChange('brands/b/materials/PLA', 'create', { material: 'PLA' })
		);
		setChange(
			cs,
			{ type: 'material', brandId: 'b', materialType: 'PETG' },
			makeChange('brands/b/materials/PETG', 'create', { material: 'PETG' })
		);
		setChange(
			cs,
			{ type: 'filament', brandId: 'b', materialType: 'PLA', filamentId: 'basic' },
			makeChange('brands/b/materials/PLA/filaments/basic', 'create', { name: 'Basic' })
		);
		setChange(
			cs,
			{
				type: 'variant',
				brandId: 'b',
				materialType: 'PLA',
				filamentId: 'basic',
				variantSlug: 'red'
			},
			makeChange('brands/b/materials/PLA/filaments/basic/variants/red', 'create', {
				color_name: 'Red'
			})
		);
	});

	describe('getDirectChildren', () => {
		it('should return direct material children of a brand', () => {
			const children = getDirectChildren(cs.tree, { type: 'brand', brandId: 'b' }, 'materials');
			expect(children.length).toBe(2);
			const keys = children.map((c) => c.key).sort();
			expect(keys).toEqual(['PETG', 'PLA']);
		});

		it('should return direct filament children of a material', () => {
			const children = getDirectChildren(
				cs.tree,
				{ type: 'material', brandId: 'b', materialType: 'PLA' },
				'filaments'
			);
			expect(children.length).toBe(1);
			expect(children[0].key).toBe('basic');
		});

		it('should return empty array for non-existent parent', () => {
			const children = getDirectChildren(
				cs.tree,
				{ type: 'brand', brandId: 'nonexistent' },
				'materials'
			);
			expect(children).toEqual([]);
		});

		it('should return empty array for non-existent namespace', () => {
			const children = getDirectChildren(
				cs.tree,
				{ type: 'brand', brandId: 'b' },
				'filaments'
			);
			expect(children).toEqual([]);
		});
	});

	describe('collectDescendantChanges', () => {
		it('should collect all descendant changes', () => {
			const brandNode = getNode(cs.tree, { type: 'brand', brandId: 'b' })!;
			const descendants = collectDescendantChanges(brandNode);
			// PLA, PETG, basic filament, red variant = 4
			expect(descendants.length).toBe(4);
		});
	});

	describe('hasDescendantChanges', () => {
		it('should return true when descendants have changes', () => {
			const brandNode = getNode(cs.tree, { type: 'brand', brandId: 'b' })!;
			expect(hasDescendantChanges(brandNode)).toBe(true);
		});

		it('should return false for a leaf node with no children', () => {
			const variantNode = getNode(cs.tree, {
				type: 'variant',
				brandId: 'b',
				materialType: 'PLA',
				filamentId: 'basic',
				variantSlug: 'red'
			})!;
			expect(hasDescendantChanges(variantNode)).toBe(false);
		});

		it('should return false when structural nodes exist but none have changes', () => {
			const freshCs = createEmptyChangeSet();
			// Create structural nodes without setting any changes
			ensureNode(freshCs, { type: 'material', brandId: 'x', materialType: 'PLA' });
			const brandNode = getNode(freshCs.tree, { type: 'brand', brandId: 'x' })!;
			expect(hasDescendantChanges(brandNode)).toBe(false);
		});

		it('should detect changes at deeply nested levels', () => {
			const freshCs = createEmptyChangeSet();
			// Only set a change on a deep variant
			setChange(
				freshCs,
				{
					type: 'variant',
					brandId: 'b',
					materialType: 'PLA',
					filamentId: 'f',
					variantSlug: 'red'
				},
				makeChange('brands/b/materials/PLA/filaments/f/variants/red', 'update')
			);
			const brandNode = getNode(freshCs.tree, { type: 'brand', brandId: 'b' })!;
			expect(hasDescendantChanges(brandNode)).toBe(true);
		});
	});

	describe('removeDescendants', () => {
		it('should remove all children but keep the node itself', () => {
			const removed = removeDescendants(cs, { type: 'brand', brandId: 'b' });

			// Should have removed: PLA, PETG, basic, red = 4 changes
			expect(removed.length).toBe(4);

			// Brand node should still exist with its change
			expect(getChange(cs, 'brands/b')).toBeDefined();

			// Children should be gone
			expect(getNode(cs.tree, { type: 'brand', brandId: 'b' })!.children).toEqual({});
			expect(getChange(cs, 'brands/b/materials/PLA')).toBeUndefined();
		});
	});

	describe('moveSubtree', () => {
		it('should move a material and its descendants to a new path', () => {
			const oldEp = { type: 'material' as const, brandId: 'b', materialType: 'PLA' };
			const newEp = { type: 'material' as const, brandId: 'b', materialType: 'NEWPLA' };
			const newEntity = {
				type: 'material',
				path: 'brands/b/materials/NEWPLA',
				id: 'NEWPLA'
			};

			moveSubtree(cs, oldEp, newEp, newEntity);

			// Old path should be gone
			expect(getChange(cs, 'brands/b/materials/PLA')).toBeUndefined();

			// New path should exist
			expect(getChange(cs, 'brands/b/materials/NEWPLA')).toBeDefined();

			// Descendants should be moved
			expect(getChange(cs, 'brands/b/materials/NEWPLA/filaments/basic')).toBeDefined();
			expect(
				getChange(cs, 'brands/b/materials/NEWPLA/filaments/basic/variants/red')
			).toBeDefined();

			// Old descendants should be gone
			expect(getChange(cs, 'brands/b/materials/PLA/filaments/basic')).toBeUndefined();
		});

		it('should do nothing if old and new paths are the same', () => {
			const ep = { type: 'material' as const, brandId: 'b', materialType: 'PLA' };
			const entity = { type: 'material', path: 'brands/b/materials/PLA', id: 'PLA' };

			moveSubtree(cs, ep, ep, entity);

			// Everything should remain unchanged
			expect(getChange(cs, 'brands/b/materials/PLA')).toBeDefined();
			expect(countChanges(cs.tree)).toBe(5);
		});
	});
});

describe('Iteration', () => {
	let cs: TreeChangeSet;

	beforeEach(() => {
		cs = createEmptyChangeSet();
		setChange(
			cs,
			{ type: 'store', storeId: 's1' },
			makeChange('stores/s1', 'create')
		);
		setChange(
			cs,
			{ type: 'brand', brandId: 'b1' },
			makeChange('brands/b1', 'update')
		);
		setChange(
			cs,
			{ type: 'material', brandId: 'b1', materialType: 'PLA' },
			makeChange('brands/b1/materials/PLA', 'create')
		);
	});

	describe('getAllChanges', () => {
		it('should return all changes as a flat array', () => {
			const changes = getAllChanges(cs.tree);
			expect(changes.length).toBe(3);
		});

		it('should return empty array for empty tree', () => {
			const empty = createEmptyChangeSet();
			expect(getAllChanges(empty.tree)).toEqual([]);
		});
	});

	describe('countChanges', () => {
		it('should count all changes', () => {
			expect(countChanges(cs.tree)).toBe(3);
		});
	});
});

describe('Serialization', () => {
	it('should serialize and deserialize preserving all data', () => {
		const cs = createEmptyChangeSet();
		const change = makeChange('brands/b', 'create', { name: 'Brand' });
		setChange(cs, { type: 'brand', brandId: 'b' }, change);
		cs.images['img-1'] = {
			id: 'img-1',
			entityPath: 'brands/b',
			property: 'logo',
			filename: 'logo.png',
			mimeType: 'image/png',
			storageKey: 'ofd_image_img-1'
		};

		const serialized = serialize(cs);
		const json = JSON.stringify(serialized);
		const parsed = JSON.parse(json);
		const restored = deserialize(parsed);

		expect(getChange(restored, 'brands/b')).toEqual(change);
		expect(restored.images['img-1']).toBeDefined();
		expect(restored._index.has('brands/b')).toBe(true);
		expect(restored.version).toBe(2);
	});

	it('should rebuild index on deserialize', () => {
		const cs = createEmptyChangeSet();
		setChange(
			cs,
			{ type: 'material', brandId: 'b', materialType: 'PLA' },
			makeChange('brands/b/materials/PLA', 'create')
		);

		const serialized = serialize(cs);
		const restored = deserialize(serialized);

		// All intermediate nodes should be in the index
		expect(restored._index.has('brands/b')).toBe(true);
		expect(restored._index.has('brands/b/materials')).toBe(true);
		expect(restored._index.has('brands/b/materials/PLA')).toBe(true);
	});
});

describe('Image Helpers', () => {
	const images: Record<string, any> = {
		'img-1': { id: 'img-1', entityPath: 'brands/b', property: 'logo' },
		'img-2': { id: 'img-2', entityPath: 'brands/b/materials/PLA', property: 'logo' },
		'img-3': { id: 'img-3', entityPath: 'brands/other', property: 'logo' }
	};

	describe('findImagesForEntity', () => {
		it('should find images for exact entity', () => {
			expect(findImagesForEntity(images, 'brands/b')).toEqual(['img-1', 'img-2']);
		});

		it('should find images for descendants', () => {
			expect(findImagesForEntity(images, 'brands/b')).toContain('img-2');
		});

		it('should not include unrelated images', () => {
			expect(findImagesForEntity(images, 'brands/b')).not.toContain('img-3');
		});
	});

	describe('moveImageReferences', () => {
		it('should update entity paths', () => {
			const imgs: Record<string, any> = {
				'img-1': { id: 'img-1', entityPath: 'brands/old' },
				'img-2': { id: 'img-2', entityPath: 'brands/old/materials/PLA' },
				'img-3': { id: 'img-3', entityPath: 'brands/other' }
			};

			moveImageReferences(imgs, 'brands/old', 'brands/new');

			expect(imgs['img-1'].entityPath).toBe('brands/new');
			expect(imgs['img-2'].entityPath).toBe('brands/new/materials/PLA');
			expect(imgs['img-3'].entityPath).toBe('brands/other'); // unchanged
		});
	});
});
