import { storeSchema } from '$lib/validation/store-schema.js';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { refreshDatabase } from '$lib/dataCacher';
import { createStore } from '$lib/server/store';
import { stripOfIllegalChars } from '$lib/globalHelpers.js';
import { triggerBackgroundValidation } from '$lib/server/validationTrigger';

export const load = async () => {
  const form = await superValidate(zod(storeSchema));

  return { form };
};

export const actions = {
  store: async ({ request, cookies }) => {
    const form = await superValidate(request, zod(storeSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await createStore(form.data);
      await refreshDatabase();

      // Trigger background validation (non-blocking)
      triggerBackgroundValidation().catch((err) => {
        console.error('Failed to trigger background validation:', err);
      });
    } catch (error) {
      console.error('Failed to create brand:', error);
      setFlash({ type: 'error', message: 'Failed to create brand. Please try again.' }, cookies);
      return fail(500, { form });
    }

    redirect(`/Store/${stripOfIllegalChars(form.data.id)}`, { type: 'success', message: 'Brand created successfully!' }, cookies);
  },
};
