/**
 * Duplicate Service
 *
 * Handles recursive duplication of entities with their children,
 * and loading/pasting children from clipboard data.
 *
 * IMPORTANT: All field stripping goes through prepareEntityData()
 * from clipboardService — the single source of truth for identity
 * field removal. Never add manual `delete` statements here.
 */

import { db } from '$lib/services/database';
import { prepareEntityData } from '$lib/services/clipboardService';
import type { Material, Filament, Variant } from '$lib/types/database';

/**
 * Strip identity fields and internal metadata from an entity for creation.
 * Uses prepareEntityData as the single source of truth, then removes
 * any internal metadata fields (prefixed with _).
 */
type ChildEntities = { material: Material; filament: Filament; variant: Variant };

function prepareChildData<T extends keyof ChildEntities>(
	entityType: T,
	data: Record<string, any>
): ChildEntities[T] {
	const prepared = prepareEntityData(entityType, data);
	// Remove internal metadata fields used for clipboard nesting
	for (const key of Object.keys(prepared)) {
		if (key.startsWith('_')) {
			delete prepared[key];
		}
	}
	// Identity fields are stripped; the db.create* calls assign fresh ones.
	return prepared as ChildEntities[T];
}

// ============================================
// Load children into nested structure (for copy)
// ============================================

/**
 * Load all children of a brand into a nested structure for clipboard.
 */
export async function loadBrandChildren(brandId: string): Promise<Record<string, any[]>> {
	const materials = await db.loadMaterials(brandId);
	const result: Record<string, any[]> = { materials: JSON.parse(JSON.stringify(materials)) };

	for (const material of materials) {
		const matType = material.materialType ?? material.material?.toUpperCase();
		if (!matType) continue;
		const filaments = await db.loadFilaments(brandId, matType);
		if (!result.filaments) result.filaments = [];
		for (const filament of filaments) {
			const filObj = JSON.parse(JSON.stringify(filament));
			filObj._parentMaterial = material.material;
			const filId = filament.slug ?? filament.id;
			const variants = await db.loadVariants(brandId, matType, filId);
			filObj._variants = JSON.parse(JSON.stringify(variants));
			result.filaments.push(filObj);
		}
	}

	return result;
}

/**
 * Load all children of a material into a nested structure for clipboard.
 */
export async function loadMaterialChildren(brandId: string, materialType: string): Promise<Record<string, any[]>> {
	const filaments = await db.loadFilaments(brandId, materialType);
	const result: Record<string, any[]> = { filaments: JSON.parse(JSON.stringify(filaments)) };

	for (const filament of filaments) {
		const filId = filament.slug ?? filament.id;
		const variants = await db.loadVariants(brandId, materialType, filId);
		const filIdx = result.filaments.findIndex((f: any) => (f.slug ?? f.id) === filId);
		if (filIdx >= 0) {
			result.filaments[filIdx]._variants = JSON.parse(JSON.stringify(variants));
		}
	}

	return result;
}

/**
 * Load all children of a filament into a nested structure for clipboard.
 */
export async function loadFilamentChildren(brandId: string, materialType: string, filamentId: string): Promise<Record<string, any[]>> {
	const variants = await db.loadVariants(brandId, materialType, filamentId);
	return { variants: JSON.parse(JSON.stringify(variants)) };
}

// ============================================
// Paste children from clipboard data
// ============================================

/**
 * Create children from clipboard data under a new brand.
 */
export async function pasteBrandChildren(
	targetBrandId: string,
	children: Record<string, any[]>
): Promise<void> {
	const materials = children.materials ?? [];
	const filaments = children.filaments ?? [];

	for (const material of materials) {
		const matData = prepareChildData('material', material);
		const result = await db.createMaterial(targetBrandId, matData);

		if (result.success && result.materialType) {
			const matFilaments = filaments.filter((f: any) => f._parentMaterial === material.material);
			for (const filament of matFilaments) {
				const variants = filament._variants ?? [];
				const filData = prepareChildData('filament', filament);
				const filResult = await db.createFilament(targetBrandId, result.materialType, filData);
				if (filResult.success && filResult.filamentId) {
					for (const variant of variants) {
						const varData = prepareChildData('variant', variant);
						varData.filament_id = filResult.filamentId;
						await db.createVariant(targetBrandId, result.materialType, filResult.filamentId, varData);
					}
				}
			}
		}
	}
}

/**
 * Create children from clipboard data under a new material.
 */
export async function pasteMaterialChildren(
	targetBrandId: string,
	targetMaterialType: string,
	children: Record<string, any[]>
): Promise<void> {
	const filaments = children.filaments ?? [];

	for (const filament of filaments) {
		const variants = filament._variants ?? [];
		const filData = prepareChildData('filament', filament);
		const result = await db.createFilament(targetBrandId, targetMaterialType, filData);
		if (result.success && result.filamentId) {
			for (const variant of variants) {
				const varData = prepareChildData('variant', variant);
				varData.filament_id = result.filamentId;
				await db.createVariant(targetBrandId, targetMaterialType, result.filamentId, varData);
			}
		}
	}
}

/**
 * Create children from clipboard data under a new filament.
 */
export async function pasteFilamentChildren(
	targetBrandId: string,
	targetMaterialType: string,
	targetFilamentId: string,
	children: Record<string, any[]>
): Promise<void> {
	const variants = children.variants ?? [];

	for (const variant of variants) {
		const varData = prepareChildData('variant', variant);
		varData.filament_id = targetFilamentId;
		await db.createVariant(targetBrandId, targetMaterialType, targetFilamentId, varData);
	}
}

// ============================================
// Duplicate children (from source entity via DB)
// ============================================

/**
 * Duplicate all materials (and their descendants) from one brand to another.
 */
export async function duplicateBrandChildren(
	sourceBrandId: string,
	targetBrandId: string,
	includeAll: boolean
): Promise<void> {
	const materials = await db.loadMaterials(sourceBrandId);

	for (const material of materials) {
		const matData = prepareChildData('material', JSON.parse(JSON.stringify(material)));
		const result = await db.createMaterial(targetBrandId, matData);
		if (result.success && result.materialType && includeAll) {
			const sourceMatType = material.materialType ?? material.material.toUpperCase();
			await duplicateMaterialChildren(
				sourceBrandId, sourceMatType,
				targetBrandId, result.materialType,
				true
			);
		}
	}
}

/**
 * Duplicate all filaments (and their variants) from one material to another.
 */
export async function duplicateMaterialChildren(
	sourceBrandId: string,
	sourceMaterialType: string,
	targetBrandId: string,
	targetMaterialType: string,
	includeAll: boolean
): Promise<void> {
	const filaments = await db.loadFilaments(sourceBrandId, sourceMaterialType);

	for (const filament of filaments) {
		const filData = prepareChildData('filament', JSON.parse(JSON.stringify(filament)));
		const result = await db.createFilament(targetBrandId, targetMaterialType, filData);
		if (result.success && result.filamentId && includeAll) {
			const sourceFilId = filament.slug ?? filament.id;
			await duplicateFilamentChildren(
				sourceBrandId, sourceMaterialType, sourceFilId,
				targetBrandId, targetMaterialType, result.filamentId
			);
		}
	}
}

/**
 * Duplicate all variants from one filament to another.
 */
export async function duplicateFilamentChildren(
	sourceBrandId: string,
	sourceMaterialType: string,
	sourceFilamentId: string,
	targetBrandId: string,
	targetMaterialType: string,
	targetFilamentId: string
): Promise<void> {
	const variants = await db.loadVariants(sourceBrandId, sourceMaterialType, sourceFilamentId);

	for (const variant of variants) {
		const varData = prepareChildData('variant', JSON.parse(JSON.stringify(variant)));
		varData.filament_id = targetFilamentId;
		await db.createVariant(targetBrandId, targetMaterialType, targetFilamentId, varData);
	}
}
