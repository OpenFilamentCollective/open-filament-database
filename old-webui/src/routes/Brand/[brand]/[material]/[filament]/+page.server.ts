import { error, redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { filamentSchema } from '$lib/validation/filament-schema';
import { filamentVariantSchema } from '$lib/validation/filament-variant-schema';
import { createVariant } from '$lib/server/variant';
import { updateFilament } from '$lib/server/filament';
import { getIdFromName, removeUndefined } from '$lib/globalHelpers';
import { setFlash } from 'sveltekit-flash-message/server';
import { refreshDatabase } from '$lib/dataCacher';
import { stripOfIllegalChars } from '$lib/globalHelpers';
import { triggerBackgroundValidation } from '$lib/server/validationTrigger';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { brand, material, filament } = params;
  const { filamentData } = await parent();

  const normalizedBrand = brand.trim().toLowerCase().replace(/\s+/g, '');
  const normalizedMaterial = material.trim().toLowerCase().replace(/\s+/g, '');
  const normalizedFilament = filament.trim().toLowerCase().replace(/\s+/g, '');

  const brandKey = Object.keys(filamentData.brands).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedBrand,
  );
  if (!brandKey) throw error(404, 'Brand not found');
  const brandData = filamentData.brands[brandKey];

  const materialKey = Object.keys(brandData.materials).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedMaterial,
  );
  if (!materialKey) throw error(404, 'Material not found');
  const materialData = brandData.materials[materialKey];

  const filamentKey = Object.keys(materialData.filaments).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedFilament,
  );
  if (!filamentKey) throw error(404, 'Filament not found');
  const filamentDataObj = materialData.filaments[filamentKey];

  let stores: string[] = [];

  Object.values(filamentData.stores).forEach((value) => {
    stores.push(value.id);
  });

  const filamentForm = await superValidate(filamentDataObj, zod(filamentSchema));
  const variantForm = await superValidate(zod(filamentVariantSchema));

  return {
    brandData,
    materialData,
    stores,
    filamentForm,
    variantForm,
    filamentData: filamentDataObj,
  };
};

export const actions = {
  filament: async ({ request, params, cookies }) => {
    const data = await request.formData();

    const form = await superValidate(data, zod(filamentSchema));
    const { brand, material, filament } = params;

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const filteredFilament = removeUndefined(form.data);
      await updateFilament(brand, material, filteredFilament);
      await refreshDatabase();

      // Trigger background validation (non-blocking)
      triggerBackgroundValidation().catch((err) => {
        console.error('Failed to trigger background validation:', err);
      });
    } catch (error) {
      console.error('Failed to update filament:', error);
      setFlash({ type: 'error', message: 'Failed to update filament. Please try again.' }, cookies);
      return fail(500, { form });
    }

    setFlash({ type: 'success', message: 'Filament updated successfully!' }, cookies);
    throw redirect(303, `/Brand/${stripOfIllegalChars(brand)}/${material}/${form.data.id}`);
  },
  variant: async ({ request, params, cookies }) => {
    let data = await request.formData();
    
    const form = await superValidate(data, zod(filamentVariantSchema));
    const { brand, material, filament } = params;

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      let filteredData = removeUndefined(form.data);

      await createVariant(brand, material, filament, filteredData);
      await refreshDatabase();

      // Trigger background validation (non-blocking)
      triggerBackgroundValidation().catch((err) => {
        console.error('Failed to trigger background validation:', err);
      });
    } catch (error) {
      console.error('Failed to update color:', error);
      setFlash({ type: 'error', message: 'Failed to update color. Please try again.' }, cookies);
      return fail(500, { form });
    }

    setFlash({ type: 'success', message: 'Color updated successfully!' }, cookies);
    throw redirect(303, `/Brand/${stripOfIllegalChars(brand)}/${material}/${filament}/${getIdFromName(form.data.name)}`);
  },
};
