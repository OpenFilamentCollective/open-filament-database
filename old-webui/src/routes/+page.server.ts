import { storeSchema } from '$lib/validation/store-schema.js';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

export const load = async () => {
  const form = await superValidate(zod(storeSchema));

  return { form };
};