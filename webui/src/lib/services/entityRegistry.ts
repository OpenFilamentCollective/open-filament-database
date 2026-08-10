/**
 * Entity Registry
 *
 * One place mapping an entity type to the DatabaseService calls, display name and
 * app route for that type. Keyed off the `EntityPath` union so callers can work
 * with a change-tree path alone — no per-type `switch` at every call site.
 *
 * Always route through `db.*`: the getters resolve renamed materials
 * (`getApiMaterialType`) and layer pending + submitted changes, and the savers
 * carry the rename detection in `_saveEntity`.
 */

import { db } from '$lib/services/database';
import { parsePath } from '$lib/utils/changePaths';
import type { EntityPath } from '$lib/types/changeTree';
import type { Brand, Filament, Material, Store, Variant } from '$lib/types/database';

/** Any entity carrying the canonical-UUID redirect fields. */
export interface Redirectable {
	uuid?: string;
	moved_from?: string[];
	[key: string]: any;
}

type PathOf<K extends EntityPath['type']> = Extract<EntityPath, { type: K }>;

export interface EntityOps<P extends EntityPath> {
	/** Human-readable type, e.g. "Filament" — used in messages and modal titles. */
	label: string;
	/** What else this delete takes with it. Absent for leaf types (variant, store). */
	cascadeWarning?: string;
	get(ep: P): Promise<Redirectable | null>;
	save(ep: P, next: Redirectable, prev: Redirectable): Promise<boolean>;
	nameOf(entity: Redirectable): string;
	/** App route for this entity (leading slash). */
	hrefOf(ep: P): string;
	/**
	 * Identity fields in repo form. Cloud payloads put a UUID in `id` and keep the
	 * on-disk folder name in `slug`, so anything saved straight back fails the
	 * schema's slug pattern and the folder-name check. The edit forms do the same
	 * normalization before saving.
	 */
	repoIdentity(ep: P, entity: Redirectable): Record<string, string>;
}

/** Prefer the entity's repo-format slug, falling back to the change-tree segment. */
function repoId(entity: Redirectable, segment: string): string {
	const slug = entity.slug;
	return typeof slug === 'string' && slug ? slug : segment;
}

export const entityOps: { [K in EntityPath['type']]: EntityOps<PathOf<K>> } = {
	store: {
		label: 'Store',
		get: (ep) => db.getStore(ep.storeId),
		save: (_ep, next, prev) => db.saveStore(next as Store, prev as Store),
		nameOf: (e) => e.name ?? e.slug ?? e.id,
		hrefOf: (ep) => `/stores/${ep.storeId}`,
		repoIdentity: (ep, e) => {
			const id = repoId(e, ep.storeId);
			return { id, slug: id };
		}
	},
	brand: {
		label: 'Brand',
		cascadeWarning:
			'This will also delete all materials, filaments, and variants within this brand.',
		get: (ep) => db.getBrand(ep.brandId),
		save: (_ep, next, prev) => db.saveBrand(next as Brand, prev as Brand),
		nameOf: (e) => e.name ?? e.slug ?? e.id,
		hrefOf: (ep) => `/brands/${ep.brandId}`,
		repoIdentity: (ep, e) => {
			const id = repoId(e, ep.brandId);
			return { id, slug: id };
		}
	},
	material: {
		label: 'Material',
		cascadeWarning: 'This will also delete all filaments and variants within this material.',
		get: (ep) => db.getMaterial(ep.brandId, ep.materialType),
		save: (ep, next, prev) =>
			db.saveMaterial(ep.brandId, ep.materialType, next as Material, prev as Material),
		nameOf: (e) => e.material ?? e.materialType ?? e.id,
		hrefOf: (ep) => `/brands/${ep.brandId}/${ep.materialType}`,
		// Materials are keyed by their type ("PLA"), not a slug.
		repoIdentity: (ep, e) => {
			const type =
				typeof e.materialType === 'string' && e.materialType
					? e.materialType
					: repoId(e, ep.materialType);
			return { id: type, materialType: type };
		}
	},
	filament: {
		label: 'Filament',
		cascadeWarning: 'This will also delete all variants within this filament.',
		get: (ep) => db.getFilament(ep.brandId, ep.materialType, ep.filamentId),
		save: (ep, next, prev) =>
			db.saveFilament(
				ep.brandId,
				ep.materialType,
				ep.filamentId,
				next as Filament,
				prev as Filament
			),
		nameOf: (e) => e.name ?? e.slug ?? e.id,
		hrefOf: (ep) => `/brands/${ep.brandId}/${ep.materialType}/${ep.filamentId}`,
		repoIdentity: (ep, e) => {
			const id = repoId(e, ep.filamentId);
			return { id, slug: id };
		}
	},
	variant: {
		label: 'Variant',
		get: (ep) => db.getVariant(ep.brandId, ep.materialType, ep.filamentId, ep.variantSlug),
		save: (ep, next, prev) =>
			db.saveVariant(
				ep.brandId,
				ep.materialType,
				ep.filamentId,
				ep.variantSlug,
				next as Variant,
				prev as Variant
			),
		nameOf: (e) => e.name ?? e.slug ?? e.id,
		hrefOf: (ep) => `/brands/${ep.brandId}/${ep.materialType}/${ep.filamentId}/${ep.variantSlug}`,
		repoIdentity: (ep, e) => {
			const id = repoId(e, ep.variantSlug);
			return { id, slug: id };
		}
	}
};

/**
 * Pair a change-tree path with its adapter.
 * Returns null when the path doesn't match a known entity shape.
 */
export function opsForPath(path: string): { ep: EntityPath; ops: EntityOps<any> } | null {
	const ep = parsePath(path);
	if (!ep) return null;
	return { ep, ops: entityOps[ep.type] as EntityOps<any> };
}
