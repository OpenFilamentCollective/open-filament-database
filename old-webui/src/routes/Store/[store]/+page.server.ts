import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { storeSchema } from '$lib/validation/store-schema.js';
import { setFlash } from 'sveltekit-flash-message/server';
import { refreshDatabase } from '$lib/dataCacher';
import { stripOfIllegalChars } from '$lib/globalHelpers';
import { updateStore } from '$lib/server/store';
import { triggerBackgroundValidation } from '$lib/server/validationTrigger';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { store } = params;
  const { filamentData } = await parent();

  // Normalize the params for lookup
  const normalizedStore = store.trim().toLowerCase().replace(/\s+/g, '');

  // Find the brand
  const storeKey = Object.keys(filamentData.stores).find(
    (key) => key.toLowerCase().replace(/\s+/g, '') === normalizedStore,
  );
  if (!storeKey) {
    error(404, 'Store not found');
  }
  const savedStoreData = filamentData.stores[storeKey];

  const defaultStoreData = {
    id: "",
    name: "",
    storefront_url: "",
    logo: undefined,
    ships_from: [],
    ships_to: []
  };

  // Create forms with existing data
  const ships_from = savedStoreData.ships_from && savedStoreData.ships_from.length > 0 ? savedStoreData.ships_from : [];
  const ships_to = savedStoreData.ships_to && savedStoreData.ships_to.length > 0 ? savedStoreData.ships_to : [];

  const storeData = {
    ...defaultStoreData,
    ...savedStoreData,
    ships_from: (structuredClone(ships_from) || []),
    ships_to: (structuredClone(ships_to) || []),
    oldStoreName: savedStoreData.name,
  };

  const storeForm = await superValidate(storeData, zod(storeSchema));
  storeForm.data.logo = undefined;

  return {
    storeData,
    storeForm,
  };
};

export const actions = {
  store: async ({ request, cookies }) => {
    const form = await superValidate(request, zod(storeSchema));
    

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await updateStore(form.data);
      await refreshDatabase();

      // Trigger background validation (non-blocking)
      triggerBackgroundValidation().catch((err) => {
        console.error('Failed to trigger background validation:', err);
      });
    } catch (error) {
      console.error('Failed to update store:', error);
      setFlash({ type: 'error', message: 'Failed to update store. Please try again.' }, cookies);
      return fail(500, { form });
    }

    throw redirect(303, `/Store/${stripOfIllegalChars(form.data.id)}`);
  },
};