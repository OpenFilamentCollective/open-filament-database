import type { EntityChange, ChangeOperation } from '$lib/types/changes';

/**
 * Interface matching the shape of the $changes derived store.
 */
interface ChangesStore {
	get(path: string): EntityChange | undefined;
	hasDescendantChanges(path: string): boolean;
	getChildChanges(
		parentPath: string,
		namespace: string
	): Array<{ id: string; change: EntityChange }>;
	getRootChanges(
		namespace: 'brands' | 'stores'
	): Array<{ id: string; change: EntityChange }>;
}

type DeletedChanges = Array<{ id: string; change: EntityChange }>;

/**
 * Append stubs for locally-deleted entities to a list.
 *
 * In cloud mode, `layerChanges` removes deleted entities from API results.
 * This function checks the change store for delete operations and creates
 * minimal stub objects so they still appear in the UI (with a "Deleted"
 * badge via EntityCard).
 *
 * For child entities, pass `parentPath` + `namespace`.
 * For root entities (brands/stores), pass `rootNamespace`.
 *
 * Designed to be called inside a Svelte 5 `$derived.by()` block.
 */
export function withDeletedStubs<T>(config: {
	changes: ChangesStore;
	useChangeTracking: boolean;
	items: T[];
	getKeys: (item: T) => (string | null | undefined)[];
	buildStub: (id: string, name: string) => T;
} & (
	| { parentPath: string; namespace: string; rootNamespace?: never }
	| { rootNamespace: 'brands' | 'stores'; parentPath?: never; namespace?: never }
)): T[] {
	const { changes, useChangeTracking, items, getKeys, buildStub } = config;

	if (!useChangeTracking) return items;

	let deletedChanges: DeletedChanges;
	if (config.rootNamespace) {
		deletedChanges = changes.getRootChanges(config.rootNamespace)
			.filter((c) => c.change.operation === 'delete');
	} else {
		deletedChanges = changes.getChildChanges(config.parentPath, config.namespace)
			.filter((c) => c.change.operation === 'delete');
	}

	if (deletedChanges.length === 0) return items;

	const existingKeys = new Set(
		items.flatMap((item) =>
			getKeys(item)
				.filter((k): k is string => k != null)
				.map((k) => k.toLowerCase())
		)
	);

	const stubs = deletedChanges
		.filter((c) => !existingKeys.has(c.id.toLowerCase()))
		.map((c) => {
			const match = c.change.description?.match(/"(.+)"/);
			const name = match?.[1] ?? c.id;
			return buildStub(c.id, name);
		});

	if (stubs.length === 0) return items;
	return [...stubs, ...items];
}

/**
 * Props needed by EntityCard for showing local-change indicators.
 */
export interface ChangeProps {
	hasLocalChanges: boolean;
	localChangeType: ChangeOperation | undefined;
	hasDescendantChanges: boolean;
}

const NO_CHANGES: ChangeProps = {
	hasLocalChanges: false,
	localChangeType: undefined,
	hasDescendantChanges: false
};

/**
 * Compute EntityCard change props for a child entity.
 */
export function getChildChangeProps(
	changes: ChangesStore,
	useChangeTracking: boolean,
	entityPath: string
): ChangeProps {
	if (!useChangeTracking) return NO_CHANGES;

	const change = changes.get(entityPath);
	return {
		hasLocalChanges: !!change,
		localChangeType: change?.operation,
		hasDescendantChanges: changes.hasDescendantChanges(entityPath)
	};
}
