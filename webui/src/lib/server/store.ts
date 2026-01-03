import { env } from "$env/dynamic/public";
import { storeSchema } from "$lib/validation/store-schema";
import { getIdFromName, getLogoName, stripOfIllegalChars } from "$lib/globalHelpers";
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type z } from 'zod';

const STORE_DIR = env.PUBLIC_STORES_PATH;

export const createStore = async (storeData: z.infer<typeof storeSchema>) => {
  let id = getIdFromName(storeData.name);

  const storeDir = path.join(STORE_DIR, id);
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }

  let logoPath = '';
  let logoUrl = '';
  if (
    storeData.logo &&
    typeof storeData.logo === 'object' &&
    typeof storeData.logo.arrayBuffer === 'function'
  ) {
    const arrayBuffer = await storeData.logo.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    logoUrl = getLogoName(storeData.logo.name);
    logoPath = path.join(storeDir, logoUrl);
    fs.writeFileSync(logoPath, buffer);
  }

  const storeJson = {
    id: id,
    name: storeData.name,
    storefront_url: storeData.storefront_url,
    logo: logoUrl,
    ships_from: storeData.ships_from,
    ships_to: storeData.ships_to,
  };

  const storeJsonPath = path.join(storeDir, 'store.json');
  fs.writeFileSync(storeJsonPath, JSON.stringify(storeJson, null, 2), 'utf-8');

  return storeDir;
};

export async function updateStore(storeData: z.infer<typeof storeSchema>) {
  const newDir = path.join(STORE_DIR, stripOfIllegalChars(storeData.id));

  const storeJson = {
    id: storeData.id,
    name: storeData.name,
    storefront_url: storeData.storefront_url,
    logo: storeData.logo,
    ships_from: storeData.ships_from,
    ships_to: storeData.ships_to,
  };

  const storeJsonPath = path.join(newDir, 'store.json');
  fs.writeFileSync(storeJsonPath, JSON.stringify(storeJson, null, 2), 'utf-8');

  console.log(`Store updated: ${storeData.oldStoreName} -> ${storeData.name}`);
  return newDir;
}