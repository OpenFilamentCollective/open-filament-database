import { createBrand, pseudoCreateBrand } from '$lib/server/brand';
import { getIdFromName, stripOfIllegalChars } from '$lib/globalHelpers';
import { brandSchema } from '$lib/validation/filament-brand-schema';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { refreshDatabase } from '$lib/dataCacher';
import { env } from '$env/dynamic/public';
import { triggerBackgroundValidation } from '$lib/server/validationTrigger';

export const load = async () => {
  const form = await superValidate(zod(brandSchema));
  
  return { form };
};

export const actions = {
  brand: async ({ request, cookies }) => {
    const form = await superValidate(request, zod(brandSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const isLocal = env.PUBLIC_IS_LOCAL === 'true';
      if (isLocal) {
        await createBrand(form.data);
        await refreshDatabase();

        // Trigger background validation (non-blocking)
        triggerBackgroundValidation().catch((err) => {
          console.error('Failed to trigger background validation:', err);
        });
      } else {
        let pseudoData = await pseudoCreateBrand(form.data);
        return { form: form, success: true, data: JSON.stringify(pseudoData), redirect: `/Brand/${stripOfIllegalChars(form.data.brand)}/`};
      }
    } catch (error) {
      console.error('Failed to create brand:', error);
      setFlash({ type: 'error', message: 'Failed to create brand. Please try again.' }, cookies);
      return fail(500, { form });
    }

    throw redirect(303, `/Brand/${getIdFromName(form.data.name)}/`);
  },
};
