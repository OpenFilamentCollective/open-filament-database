/**
 * The editor keeps a variant's spools inside its data; the validator overlay must see them as
 * sizes.json, not as a `sizes` key in variant.json (rustValidator.ts).
 */
import { describe, it, expect } from 'vitest';
import { splitVariantSizes } from '$lib/server/rustValidator';

const VARIANT = 'brands/insignia/materials/PLA/filaments/glitter_pla/variants/night_saphire';

describe('splitVariantSizes', () => {
	it('moves spools out of variant changes and into sizes.json content', () => {
		const sizes = [{ filament_weight: 1000, diameter: 1.75 }];
		const { changes, sizes: pending } = splitVariantSizes(
			[
				{
					entity: { type: 'variant', path: VARIANT, id: 'night_saphire' },
					operation: 'update',
					data: { id: 'night_saphire', name: 'Night Sapphire', sizes },
					originalData: { id: 'night_saphire', name: 'Night Saphire', sizes }
				},
				{
					entity: { type: 'filament', path: 'brands/insignia/materials/PLA/filaments/glitter_pla' },
					operation: 'create',
					data: { name: 'Glitter PLA', sizes: 'not a variant' }
				}
			],
			'/repo'
		);
		expect((changes[0] as any).data).toEqual({ id: 'night_saphire', name: 'Night Sapphire' });
		expect((changes[0] as any).originalData).not.toHaveProperty('sizes');
		// Only variants carry spools.
		expect((changes[1] as any).data.sizes).toBe('not a variant');
		expect(pending).toEqual([
			{
				path: '/repo/data/insignia/PLA/glitter_pla/night_saphire/sizes.json',
				content: JSON.stringify(sizes)
			}
		]);
	});

	it('leaves deletes and spool-less variants alone', () => {
		const del = { entity: { type: 'variant', path: VARIANT }, operation: 'delete', data: null };
		const { changes, sizes } = splitVariantSizes([del], '/repo');
		expect(changes[0]).toEqual({ ...del, data: null, originalData: undefined });
		expect(sizes).toEqual([]);
	});
});
