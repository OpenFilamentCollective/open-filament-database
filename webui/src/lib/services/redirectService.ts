/**
 * Redirect Service
 *
 * Deleting an entry throws away its canonical UUID, and every downstream consumer
 * that resolved that UUID breaks. Redirecting instead records the deleted entry's
 * UUID on its replacement's `moved_from`, so old references keep resolving
 * (see `api/v1/uuid-index.json`, built by ofd/builder/exporters/uuid_index_exporter.py).
 *
 * The redirect and the deletion are two separate staged changes — the change tree
 * has no transaction, and the export pipeline expects both.
 */

import { db } from '$lib/services/database';
import { deleteEntity, type DeleteResult } from '$lib/services/entityService';
import { opsForPath, entityOps, type Redirectable } from '$lib/services/entityRegistry';
import { buildPath } from '$lib/utils/changePaths';
import type { EntityPath } from '$lib/types/changeTree';

/** A chosen replacement, resolved to change-tree coordinates. */
export interface RedirectTarget {
	/** Change-tree path, e.g. brands/acme/materials/PLA/filaments/foo */
	path: string;
	name: string;
	/** App route, for post-redirect navigation. */
	href: string;
	/** Display-only context, e.g. "Acme · PLA". */
	context?: string;
}

/** The entity being deleted, described by the page that owns it. */
export interface RedirectSource {
	type: EntityPath['type'];
	/** Change-tree path of the entity being deleted. */
	path: string;
	/** Human-readable type, e.g. "Filament". */
	label: string;
	name: string;
	uuid?: string;
	movedFrom?: string[];
	/** The page's own `db.deleteX(...)` call. */
	deleteFn: () => Promise<boolean>;
}

export interface RedirectDeleteResult extends DeleteResult {
	/** UUIDs newly written onto the target — empty when there was nothing to record. */
	recorded?: string[];
	targetHref?: string;
	targetName?: string;
}

/**
 * Union `source`'s uuid (and any `moved_from` it already carried) into
 * `target.moved_from`, returning the new list and the UUIDs it added.
 *
 * Mirrors `_absorb_moved_from` in ofd/uuids.py — keep the two in lockstep:
 *  - normalize with trim + lowercase; ignore non-strings and empties
 *  - candidate order is source uuid first, then its own moved_from (chains flatten)
 *  - never record the target's own uuid (no self-redirect)
 *  - dedupe case-insensitively; entries already on the target keep their casing
 */
export function absorbMovedFrom(
	target: Redirectable,
	source: Pick<Redirectable, 'uuid' | 'moved_from'>
): { movedFrom: string[]; added: string[] } {
	const norm = (value: unknown): string =>
		typeof value === 'string' ? value.trim().toLowerCase() : '';

	const current = Array.isArray(target.moved_from)
		? target.moved_from.filter((x): x is string => typeof x === 'string')
		: [];

	const candidates: string[] = [];
	const sourceUuid = norm(source.uuid);
	if (sourceUuid) candidates.push(sourceUuid);
	if (Array.isArray(source.moved_from)) {
		for (const item of source.moved_from) {
			const n = norm(item);
			if (n) candidates.push(n);
		}
	}
	if (candidates.length === 0) return { movedFrom: current, added: [] };

	const targetUuid = norm(target.uuid);
	const seen = new Set(current.map((x) => x.trim().toLowerCase()));
	const movedFrom = [...current];
	const added: string[] = [];

	for (const candidate of candidates) {
		if (candidate === targetUuid || seen.has(candidate)) continue;
		movedFrom.push(candidate);
		seen.add(candidate);
		added.push(candidate);
	}

	return { movedFrom, added };
}

/**
 * Record a redirect from `source` onto `target`, then delete the source.
 * Pass `target: null` for a plain delete with no redirect recorded.
 */
export async function redirectAndDelete(
	source: RedirectSource,
	target: RedirectTarget | null
): Promise<RedirectDeleteResult> {
	if (!target) {
		return deleteEntity(source.path, source.label, source.deleteFn);
	}

	const resolved = opsForPath(target.path);
	if (!resolved) {
		return { success: false, message: 'Could not resolve the replacement entry.' };
	}
	const { ep, ops } = resolved;

	const typeName = source.label.toLowerCase();
	if (ep.type !== source.type) {
		return { success: false, message: `A ${typeName} can only redirect to another ${typeName}.` };
	}

	// No self-redirect — and defensively, no target nested under the source, which
	// the source's own cascade would delete right after recording the redirect.
	const sourcePath = source.path.toLowerCase();
	const targetPath = target.path.toLowerCase();
	if (targetPath === sourcePath || targetPath.startsWith(`${sourcePath}/`)) {
		return { success: false, message: `A ${typeName} cannot redirect to itself.` };
	}

	const targetEntity = await ops.get(ep);
	if (!targetEntity) {
		return { success: false, message: `Replacement ${typeName} not found.` };
	}

	const { movedFrom, added } = absorbMovedFrom(targetEntity, {
		uuid: source.uuid,
		moved_from: source.movedFrom
	});

	// Stage the redirect on the replacement *before* the deletion: once the source's
	// delete is staged, a target that sits under it would no longer resolve. Save only
	// when something was actually recorded, so no no-op update is staged.
	if (added.length > 0) {
		// Normalize identity on both sides: a cloud payload's `id` is a UUID, which
		// fails the repo's slug pattern and folder-name check. Normalizing the
		// original too keeps the staged change down to the `moved_from` addition.
		const identity = ops.repoIdentity(ep, targetEntity);
		const previous = { ...targetEntity, ...identity };
		const saved = await ops.save(ep, { ...previous, moved_from: movedFrom }, previous);
		if (!saved) {
			return { success: false, message: `Failed to record the redirect on "${target.name}".` };
		}
	}

	const result = await deleteEntity(source.path, source.label, source.deleteFn);
	return { ...result, recorded: added, targetHref: target.href, targetName: target.name };
}

/**
 * List a filament's variants as redirect targets.
 *
 * Variants are absent from the search index, so the variant picker is two-step:
 * find the replacement's filament in the index, then pick one of its variants here.
 */
export async function loadVariantTargets(filamentPath: string): Promise<RedirectTarget[]> {
	const resolved = opsForPath(filamentPath);
	if (!resolved || resolved.ep.type !== 'filament') return [];

	const { brandId, materialType, filamentId } = resolved.ep;
	const variants = await db.loadVariants(brandId, materialType, filamentId);

	return variants.map((variant) => {
		const ep: EntityPath = {
			type: 'variant',
			brandId,
			materialType,
			filamentId,
			variantSlug: variant.slug ?? variant.id
		};
		return {
			path: buildPath(ep),
			name: variant.name,
			href: entityOps.variant.hrefOf(ep)
		};
	});
}
