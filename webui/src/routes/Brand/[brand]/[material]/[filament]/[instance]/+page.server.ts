import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { removeUndefined } from '$lib/globalHelpers';
import { setFlash } from 'sveltekit-flash-message/server';
import { filamentVariantSchema } from '$lib/validation/filament-variant-schema';
import { refreshDatabase } from '$lib/dataCacher';
import { stripOfIllegalChars } from '$lib/globalHelpers';
import { updateVariant } from '$lib/server/variant';
import { triggerBackgroundValidation } from '$lib/server/validationTrigger';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { brand, material, filament, instance } = params;
  const { filamentData } = await parent();

  // Normalize the params for lookup
  const normalizedBrand = brand.trim().toLowerCase().replace(/\s+/g, '');
  const normalizedMaterial = material.trim().toLowerCase().replace(/\s+/g, '');
  const normalizedFilament = filament.trim().toLowerCase().replace(/\s+/g, '');
  const normalizedInstance = instance.trim().toLowerCase().replace(/\s+/g, '');

  // Find the brand
  const brandKey = Object.keys(filamentData.brands).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedBrand,
  );
  if (!brandKey) {
    error(404, 'Brand not found');
  }
  const brandData = filamentData.brands[brandKey];

  // Find the material
  const materialKey = Object.keys(brandData.materials).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedMaterial,
  );
  if (!materialKey) {
    error(404, 'Material not found');
  }
  const materialData = brandData.materials[materialKey];

  // Find the filament
  const filamentKey = Object.keys(materialData.filaments).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedFilament,
  );
  if (!filamentKey) {
    error(404, 'Filament not found');
  }
  const filamentDataObj = materialData.filaments[filamentKey];

  // Find the color/instance
  const colorKey = Object.keys(filamentDataObj.colors).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedInstance,
  );
  if (!colorKey) {
    error(404, 'Color not found');
  }
  const colorData = filamentDataObj.colors[colorKey];

  const defaultVariantData = {
    id: '',
    name: '',
    color_hex: '#000000',
    traits: {
      translucent: false,
      glow: false,
      matte: false,
      recycled: false,
      recyclable: false,
      biodegradable: false,
    },
  };

  // Create forms with existing data
  const sizeData = colorData.sizes && colorData.sizes.length > 0 ? colorData.sizes : {};

  const variantData = {
    ...defaultVariantData,
    ...colorData.variant,
    traits: {
      ...defaultVariantData.traits,
      ...(colorData.variant?.traits || {}),
    },
    sizes: (structuredClone(sizeData) || [])
  };

  let stores: string[] = [];
  Object.values(filamentData.stores).forEach((value) => {
    stores.push(value.id);
  });

  const variantForm = await superValidate(variantData, zod(filamentVariantSchema));

  return {
    brandData,
    materialData,
    filamentData: filamentDataObj,
    colorData,
    stores,
    variantForm,
  };
};

export const actions = {
  variant: async ({ request, params, cookies }) => {
    let data = await request.formData();

    const form = await superValidate(data, zod(filamentVariantSchema));
    const { brand, material, filament, instance } = params;

    if (!form.valid) {
      return fail(400, { form });
    }
    
    try {
      let filteredData = removeUndefined(form.data);

      if (Array.isArray(filteredData.color_hex) && filteredData.color_hex.length === 1) {
        filteredData.color_hex = filteredData.color_hex[0];
      }

      await updateVariant(brand, material, filament, instance, filteredData);
      await refreshDatabase();

      // Trigger background validation (non-blocking)
      triggerBackgroundValidation().catch((err) => {
        console.error('Failed to trigger background validation:', err);
      });
    } catch (error) {
      console.error('Failed to update variant:', error);
      setFlash({ type: 'error', message: 'Variant to update filament. Please try again.' }, cookies);
      return fail(500, { form });
    }

    setFlash({ type: 'success', message: 'Variant updated successfully!' }, cookies);
    throw redirect(303, `/Brand/${stripOfIllegalChars(brand)}/${material}/${filament}/${form.data.id}`);
  }
};
