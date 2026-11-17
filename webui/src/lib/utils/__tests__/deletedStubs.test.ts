/**
 * Tests for deletedStubs utility.
 *
 * Covers both the pending-delete and submitted-delete merge paths, plus the
 * change-props computation used by EntityCards for badge rendering.
 *
 * The submitted-buffer integration here is the specific case CLAUDE.md
 * highlighted: pending > submitted > API precedence must be enforced so
 * a submitted-then-recreated entity doesn't render twice.
 */
import { describe, it, expect } from 'vitest';
import { withDeletedStubs, getChildChangeProps } from '../deletedStubs';
import type { EntityChange } from '$lib/types/changes';

interface FakeItem {
	id: string;
	name: string;
}

function buildStub(id: string, name: string): FakeItem {
	return { id, name };
}

function getKeys(item: FakeItem): string[] {
	return [item.id];
}

function makeChange(
	id: string,
	op: EntityChange['operation'],
	path?: string,
	name?: string
): EntityChange {
	return {
		entity: { type: 'brand', id, path: path ?? `brands/${id}` },
		operation: op,
		data: { id, name: name ?? id },
		timestamp: Date.now(),
		description: name ? `Deleted brand "${name}"` : `Deleted brand "${id}"`
	};
}

function makeChangesStore(opts: {
	rootChanges?: Array<{ id: string; change: EntityChange }>;
	childChanges?: Array<{ id: string; change: EntityChange }>;
	pathChanges?: Record<string, EntityChange>;
	descendantChangePaths?: Set<string>;
} = {}) {
	return {
		get: (path: string) => opts.pathChanges?.[path],
		getRootChanges: () => opts.rootChanges ?? [],
		getChildChanges: () => opts.childChanges ?? [],
		hasDescendantChanges: (path: string) => opts.descendantChangePaths?.has(path) ?? false
	};
}

describe('withDeletedStubs (root namespace)', () => {
	it('returns items unchanged when change tracking is off', () => {
		const changes = makeChangesStore({
			rootChanges: [{ id: 'gone', change: makeChange('gone', 'delete') }]
		});
		const result = withDeletedStubs<FakeItem>({
			changes,
			useChangeTracking: false,
			items: [{ id: 'kept', name: 'Kept' }],
			getKeys,
			buildStub,
			rootNamespace: 'brands'
		});
		expect(result).toEqual([{ id: 'kept', name: 'Kept' }]);
	});

	it('prepends stubs for locally-deleted entities not in the API list', () => {
		const changes = makeChangesStore({
			rootChanges: [
				{ id: 'deleted-brand', change: makeChange('deleted-brand', 'delete', undefined, 'Old Brand') }
			]
		});
		const result = withDeletedStubs<FakeItem>({
			changes,
			useChangeTracking: true,
			items: [{ id: 'kept', name: 'Kept' }],
			getKeys,
			buildStub,
			rootNamespace: 'brands'
		});
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ id: 'deleted-brand', name: 'Old Brand' });
		expect(result[1]).toEqual({ id: 'kept', name: 'Kept' });
	});

	it('does not duplicate an entity that already exists in the list', () => {
		const changes = makeChangesStore({
			rootChanges: [{ id: 'kept', change: makeChange('kept', 'delete') }]
		});
		const result = withDeletedStubs<FakeItem>({
			changes,
			useChangeTracking: true,
			items: [{ id: 'kept', name: 'Kept' }],
			getKeys,
			buildStub,
			rootNamespace: 'brands'
		});
		expect(result).toEqual([{ id: 'kept', name: 'Kept' }]);
	});

	it('ignores non-delete operations (create/update do not produce stubs)', () => {
		const changes = makeChangesStore({
			rootChanges: [
				{ id: 'created', change: makeChange('created', 'create') },
				{ id: 'updated', change: makeChange('updated', 'update') },
				{ id: 'deleted', change: makeChange('deleted', 'delete') }
			]
		});
		const result = withDeletedStubs<FakeItem>({
			changes,
			useChangeTracking: true,
			items: [],
			getKeys,
			buildStub,
			rootNamespace: 'brands'
		});
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('deleted');
	});

	it('extracts the display name from the change description ("Deleted X")', () => {
		const change: EntityChange = {
			...makeChange('slug-only', 'delete'),
			description: 'Deleted brand "Pretty Name"'
		};
		const changes = makeChangesStore({
			rootChanges: [{ id: 'slug-only', change }]
		});
		const result = withDeletedStubs<FakeItem>({
			changes,
			useChangeTracking: true,
			items: [],
			getKeys,
			buildStub,
			rootNamespace: 'brands'
		});
		expect(result[0].name).toBe('Pretty Name');
	});

	it('falls back to the id when no description name is present', () => {
		const change: EntityChange = {
			...makeChange('slug-only', 'delete'),
			description: 'no quoted name'
		};
		const changes = makeChangesStore({
			rootChanges: [{ id: 'slug-only', change }]
		});
		const result = withDeletedStubs<FakeItem>({
			changes,
			useChangeTracking: true,
			items: [],
			getKeys,
			buildStub,
			rootNamespace: 'brands'
		});
		expect(result[0].name).toBe('slug-only');
	});

	it('merges submitted deletes alongside pending deletes', () => {
		const changes = makeChangesStore({
			rootChanges: [
				{
					id: 'pending-deleted',
					change: makeChange('pending-deleted', 'delete', undefined, 'Pending')
				}
			]
		});
		const submitted = {
			has: () => false,
			getChange: () => undefined,
			hasDescendantChanges: () => false,
			getDirectChildChanges: (prefix: string) => {
				if (prefix === 'brands/') {
					return [
						{
							entityId: 'submitted-deleted',
							change: makeChange('submitted-deleted', 'delete', 'brands/submitted-deleted', 'Submitted')
						}
					];
				}
				return [];
			}
		};

		const result = withDeletedStubs<FakeItem>({
			changes,
			submitted,
			useChangeTracking: true,
			items: [],
			getKeys,
			buildStub,
			rootNamespace: 'brands'
		});
		const ids = result.map((r) => r.id).sort();
		expect(ids).toEqual(['pending-deleted', 'submitted-deleted']);
	});

	it('does not duplicate an entity that is both pending and submitted deleted', () => {
		// Pending takes precedence; submitted-buffer record is ignored when the
		// pending change covers the same id (precedence pending > submitted).
		const changes = makeChangesStore({
			rootChanges: [
				{ id: 'gone', change: makeChange('gone', 'delete', undefined, 'Gone Pending') }
			]
		});
		const submitted = {
			has: () => false,
			getChange: () => undefined,
			hasDescendantChanges: () => false,
			getDirectChildChanges: () => [
				{
					entityId: 'gone',
					change: makeChange('gone', 'delete', 'brands/gone', 'Gone Submitted')
				}
			]
		};

		const result = withDeletedStubs<FakeItem>({
			changes,
			submitted,
			useChangeTracking: true,
			items: [],
			getKeys,
			buildStub,
			rootNamespace: 'brands'
		});
		expect(result).toHaveLength(1);
		// Pending description wins over submitted ("Pending" not "Submitted")
		expect(result[0].name).toBe('Gone Pending');
	});
});

describe('withDeletedStubs (child namespace)', () => {
	it('queries getChildChanges with the parent path and namespace', () => {
		let calledWith: any;
		const changes = {
			get: () => undefined,
			getRootChanges: () => [],
			getChildChanges: (parent: string, ns: string) => {
				calledWith = { parent, ns };
				return [
					{
						id: 'pla',
						change: makeChange('pla', 'delete', 'brands/acme/materials/pla', 'PLA')
					}
				];
			},
			hasDescendantChanges: () => false
		};

		const result = withDeletedStubs<FakeItem>({
			changes,
			useChangeTracking: true,
			items: [],
			getKeys,
			buildStub,
			parentPath: 'brands/acme',
			namespace: 'materials'
		});

		expect(calledWith).toEqual({ parent: 'brands/acme', ns: 'materials' });
		expect(result[0]).toEqual({ id: 'pla', name: 'PLA' });
	});

	it('merges child-level submitted deletes', () => {
		const changes = makeChangesStore({ childChanges: [] });
		const submitted = {
			has: () => false,
			getChange: () => undefined,
			hasDescendantChanges: () => false,
			getDirectChildChanges: (prefix: string) => {
				expect(prefix).toBe('brands/acme/materials/');
				return [
					{
						entityId: 'abs',
						change: makeChange('abs', 'delete', 'brands/acme/materials/abs', 'ABS')
					}
				];
			}
		};

		const result = withDeletedStubs<FakeItem>({
			changes,
			submitted,
			useChangeTracking: true,
			items: [],
			getKeys,
			buildStub,
			parentPath: 'brands/acme',
			namespace: 'materials'
		});
		expect(result[0]).toEqual({ id: 'abs', name: 'ABS' });
	});
});

describe('getChildChangeProps', () => {
	it('returns NO_CHANGES when change tracking is off', () => {
		const changes = makeChangesStore({
			pathChanges: {
				'brands/acme': makeChange('acme', 'update')
			}
		});
		const props = getChildChangeProps(changes, false, 'brands/acme');
		expect(props.hasLocalChanges).toBe(false);
		expect(props.localChangeType).toBeUndefined();
		expect(props.hasDescendantChanges).toBe(false);
		expect(props.hasSubmittedChanges).toBe(false);
		expect(props.submittedChangeType).toBeUndefined();
	});

	it('reports local change presence and type', () => {
		const change = makeChange('acme', 'update');
		const changes = makeChangesStore({ pathChanges: { 'brands/acme': change } });
		const props = getChildChangeProps(changes, true, 'brands/acme');
		expect(props.hasLocalChanges).toBe(true);
		expect(props.localChangeType).toBe('update');
	});

	it('reports descendant change presence', () => {
		const changes = makeChangesStore({
			descendantChangePaths: new Set(['brands/acme'])
		});
		const props = getChildChangeProps(changes, true, 'brands/acme');
		expect(props.hasDescendantChanges).toBe(true);
	});

	it('reports submitted change presence and type when submitted store provided', () => {
		const submittedChange = makeChange('acme', 'delete');
		const submitted = {
			has: () => true,
			getChange: () => ({
				change: submittedChange,
				entry: {} as any
			}),
			hasDescendantChanges: () => false,
			getDirectChildChanges: () => []
		};
		const changes = makeChangesStore();
		const props = getChildChangeProps(changes, true, 'brands/acme', submitted);
		expect(props.hasSubmittedChanges).toBe(true);
		expect(props.submittedChangeType).toBe('delete');
	});

	it('returns no submitted-change info when no submitted store passed', () => {
		const change = makeChange('acme', 'update');
		const changes = makeChangesStore({ pathChanges: { 'brands/acme': change } });
		const props = getChildChangeProps(changes, true, 'brands/acme');
		expect(props.hasSubmittedChanges).toBe(false);
		expect(props.submittedChangeType).toBeUndefined();
	});

	it('returns submitted change even when no pending change exists (submitted > API)', () => {
		const submittedChange = makeChange('acme', 'update');
		const submitted = {
			has: () => true,
			getChange: () => ({ change: submittedChange, entry: {} as any }),
			hasDescendantChanges: () => false,
			getDirectChildChanges: () => []
		};
		const changes = makeChangesStore(); // no pending changes
		const props = getChildChangeProps(changes, true, 'brands/acme', submitted);
		expect(props.hasLocalChanges).toBe(false);
		expect(props.hasSubmittedChanges).toBe(true);
	});
});
