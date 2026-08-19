import type { EntityChange, ChangeOperation } from '$lib/types/changes';
import type { submittedStore as SubmittedStoreType } from '$lib/stores/submitted';

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

/** Interface matching the submitted store's lookup methods. */
export type SubmittedLookup = Pick<
	typeof SubmittedStoreType,
	'has' | 'getChange' | 'hasDescendantChanges' | 'getDirectChildChanges'
>;

type DeletedChanges = Array<{ id: string; change: EntityChange }>;

/**
 * Append stubs for locally-deleted entities to a list.
 *
 * In cloud mode, `layerChanges` removes deleted entities from API results.
 * This function checks the change store for delete operations and creates
 * minimal stub objects so they still appear in the UI (with a "Deleted"
 * badge via EntityCard).
 *
 * Also handles submitted deletes (pending-merge) so they remain visible.
 *
 * For child entities, pass `parentPath` + `namespace`.
 * For root entities (brands/stores), pass `rootNamespace`.
 *
 * Designed to be called inside a Svelte 5 `$derived.by()` block.
 */
export function withDeletedStubs<T>(config: {
	changes: ChangesStore;
	submitted?: SubmittedLookup;
	useChangeTracking: boolean;
	items: T[];
	getKeys: (item: T) => (string | null | undefined)[];
	buildStub: (id: string, name: string) => T;
} & (
	| { parentPath: string; namespace: string; rootNamespace?: never }
	| { rootNamespace: 'brands' | 'stores'; parentPath?: never; namespace?: never }
)): T[] {
	const { changes, submitted, useChangeTracking, items, getKeys, buildStub } = config;

	if (!useChangeTracking) return items;

	let deletedChanges: DeletedChanges;
	if (config.rootNamespace) {
		deletedChanges = changes.getRootChanges(config.rootNamespace)
			.filter((c) => c.change.operation === 'delete');
	} else {
		deletedChanges = changes.getChildChanges(config.parentPath, config.namespace)
			.filter((c) => c.change.operation === 'delete');
	}

	// Also include submitted deletes
	if (submitted) {
		const prefix = config.rootNamespace
			? `${config.rootNamespace}/`
			: `${config.parentPath}/${config.namespace}/`;
		const submittedDeletes = submitted.getDirectChildChanges(prefix)
			.filter((c) => c.change.operation === 'delete');
		// Avoid duplicates with pending deletes
		const pendingIds = new Set(deletedChanges.map((c) => c.id.toLowerCase()));
		for (const sc of submittedDeletes) {
			if (!pendingIds.has(sc.entityId.toLowerCase())) {
				deletedChanges.push({ id: sc.entityId, change: sc.change });
			}
		}
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
	hasSubmittedChanges: boolean;
	submittedChangeType: ChangeOperation | undefined;
	/** PR number of the submission this entity is in, so the badge can name the review. */
	submittedPrNumber: number | undefined;
}

/** Shared "nothing changed here" props, for callers that skip the lookup entirely. */
export const NO_CHANGES: ChangeProps = {
	hasLocalChanges: false,
	localChangeType: undefined,
	hasDescendantChanges: false,
	hasSubmittedChanges: false,
	submittedChangeType: undefined,
	submittedPrNumber: undefined
};

/**
 * Compute EntityCard change props for a child entity.
 */
export function getChildChangeProps(
	changes: ChangesStore,
	useChangeTracking: boolean,
	entityPath: string,
	submitted?: SubmittedLookup
): ChangeProps {
	if (!useChangeTracking) return NO_CHANGES;

	const change = changes.get(entityPath);
	const sub = submitted?.getChange(entityPath);

	return {
		hasLocalChanges: !!change,
		localChangeType: change?.operation,
		hasDescendantChanges: changes.hasDescendantChanges(entityPath),
		hasSubmittedChanges: !!sub,
		submittedChangeType: sub?.change.operation,
		submittedPrNumber: sub?.entry.prNumber
	};
}
