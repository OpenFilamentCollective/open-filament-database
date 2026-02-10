import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { filamentMaterialSchema } from '$lib/validation/filament-material-schema';
import { zod } from 'sveltekit-superforms/adapters';
import { createFilament } from '$lib/server/filament';
import { transformMaterialData } from '$lib/server/material';
import { getIdFromName, removeUndefined } from '$lib/globalHelpers';
import { updateMaterial } from '$lib/server/material';
import { stripOfIllegalChars } from '$lib/globalHelpers';
import { filamentSchema } from '$lib/validation/filament-schema';
import { refreshDatabase } from '$lib/dataCacher';
import { setFlash } from 'sveltekit-flash-message/server';
import { triggerBackgroundValidation } from '$lib/server/validationTrigger';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { brand, material } = params;
  const { filamentData } = await parent();

  const normalizedBrand = brand.trim().toLowerCase().replace(/\s+/g, '');
  const normalizedMaterial = material.trim().toLowerCase().replace(/\s+/g, '');

  const brandKey = Object.keys(filamentData.brands).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedBrand,
  );
  if (!brandKey) {
    error(404, 'Brand not found');
  }

  const brandData = filamentData.brands[brandKey];

  const currentMaterial = brandData.materials[material];

  const filamentForm = await superValidate(zod(filamentSchema));

  const materialKey = Object.keys(brandData.materials).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedMaterial,
  );
  if (!materialKey) {
    error(404, 'Material not found');
  }

  const materialData = brandData.materials[materialKey];

  const flattenedMaterialData = transformMaterialData(materialData);

  const materialForm = await superValidate(flattenedMaterialData, zod(filamentMaterialSchema));

  return {
    brandData,
    materialForm,
    filamentForm,
    materialData,
  };
};

export const actions = {
  material: async ({ request, params, cookies }) => {
    const form = await superValidate(request, zod(filamentMaterialSchema));
    const { brand, material } = params;


    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      updateMaterial(brand, material, form.data);
      await refreshDatabase();

      // Trigger background validation (non-blocking)
      triggerBackgroundValidation().catch((err) => {
        console.error('Failed to trigger background validation:', err);
      });
    } catch (error) {
      console.error('Failed to update material:', error);
      setFlash({ type: 'error', message: 'Failed to update material. Please try again.' }, cookies);
      return fail(500, { form });
    }

    setFlash({ type: 'success', message: 'Material updated successfully!' }, cookies);
    throw redirect(303, `/Brand/${stripOfIllegalChars(brand)}/${form.data.material}`);
  },
  filament: async ({ request, params, cookies }) => {
    const form = await superValidate(request, zod(filamentSchema));
    const { brand, material } = params;

    if (!form.valid) {
      fail(400, { form });
    }

    try {
      const filteredFilament = removeUndefined(form.data);
      await createFilament(brand, material, filteredFilament);
      await refreshDatabase();

      // Trigger background validation (non-blocking)
      triggerBackgroundValidation().catch((err) => {
        console.error('Failed to trigger background validation:', err);
      });
    } catch (error) {
      console.error('Failed to update filament:', error);
      setFlash({ type: 'error', message: 'Failed to update fiilament. Please try again.' }, cookies);
      fail(500, { form });
    }

    setFlash({ type: 'success', message: 'Filament updated successfully!' }, cookies);
    throw redirect(303, `/Brand/${stripOfIllegalChars(brand)}/${material}/${getIdFromName(form.data.name)}`);
  },
};
