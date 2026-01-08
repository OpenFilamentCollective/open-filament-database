import { getFilamentDatabase } from '$lib/dataCacher';
import type { ServerInit } from '@sveltejs/kit';

export const init: ServerInit = async () => {
  console.log("Preloading database...");
	await getFilamentDatabase();
};