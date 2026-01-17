import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { brandSchema } from '$lib/validation/filament-brand-schema';
import { createMaterial } from '$lib/server/material';
import { getIdFromName, removeUndefined } from '$lib/globalHelpers';
import { updateBrand } from '$lib/server/brand';
import { stripOfIllegalChars } from '$lib/globalHelpers';
import { filamentMaterialSchema } from '$lib/validation/filament-material-schema';
import { refreshDatabase } from '$lib/dataCacher';
import { setFlash } from 'sveltekit-flash-message/server';
import { triggerBackgroundValidation } from '$lib/server/validationTrigger';

export const load: PageServerLoad = async ({ params, parent, cookies }) => {
  const { brand } = params;
  const { filamentData } = await parent();

  const normalizedBrand = brand.trim().toLowerCase().replace(/\s+/g, '');

  const brandKey = Object.keys(filamentData.brands).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedBrand,
  );


  let brandForm = null;
  let brandData = null;

  if (filamentData.brands?.[brandKey]) {
    brandData = filamentData.brands?.[brandKey] || null;

    const formData: any = {
      id: brandData.id || getIdFromName(brandData.name),
      name: brandData.name || brandData.brand,
      website: brandData.website || 'https://',
      origin: brandData.origin || '',
    };

    brandForm = await superValidate(formData, zod(brandSchema));
  }  else {
    brandForm = null;
    brandData = null;
  }

  const materialForm = await superValidate(zod(filamentMaterialSchema));
  return {
    brandForm,
    materialForm,
    brandData,
    normalizedBrand,
  };
};

export const actions = {
  brand: async ({ request, cookies }) => {
    const form = await superValidate(request, zod(brandSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await updateBrand(form.data);
      await refreshDatabase();

      // Trigger background validation (non-blocking)
      triggerBackgroundValidation().catch((err) => {
        console.error('Failed to trigger background validation:', err);
      });
    } catch (error) {
      console.error('Failed to update brand:', error);
      setFlash({ type: 'error', message: 'Failed to update brand. Please try again.' }, cookies);
      return fail(500, { form });
    }

    setFlash({ type: 'success', message: 'Brand updated successfully!' }, cookies);
    throw redirect(303, `/Brand/${form.data.id}/`);
  },
  material: async ({ request, params, cookies }) => {
    const form = await superValidate(request, zod(filamentMaterialSchema));
    const { brand } = params;

    if (!form.valid) {
      fail(400, { form });
    }

    try {
      let filteredData = removeUndefined(form.data);

      await createMaterial(brand, filteredData);
      await refreshDatabase();

      // Trigger background validation (non-blocking)
      triggerBackgroundValidation().catch((err) => {
        console.error('Failed to trigger background validation:', err);
      });
    } catch (error) {
      console.error('Failed to create material:', error);
      setFlash({ type: 'error', message: 'Failed to create material. Please try again.' }, cookies);
      return fail(500, { form });
    }

    setFlash({ type: 'success', message: 'Material created successfully!' }, cookies);
    throw redirect(303, `/Brand/${stripOfIllegalChars(brand)}/${form.data.material}`);
  },
};
