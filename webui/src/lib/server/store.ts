import { env } from "$env/dynamic/public";
import { storeSchema } from "$lib/validation/store-schema";
import { stripOfIllegalChars } from "$lib/globalHelpers";
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type z } from 'zod';

const STORE_DIR = env.PUBLIC_STORES_PATH;

export const createStore = async (storeData: z.infer<typeof storeSchema>) => {
  let folderName = stripOfIllegalChars(storeData.id);

  const storeDir = path.join(STORE_DIR, folderName);
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
    logoPath = path.join(storeDir, storeData.logo.name);
    fs.writeFileSync(logoPath, buffer);
    logoUrl = `${storeData.logo.name}`;
  }

  const storeJson = {
    id: storeData.id,
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
  const oldDir = path.join(STORE_DIR, stripOfIllegalChars(storeData.oldStoreName || storeData.id));
  const newDir = path.join(STORE_DIR, stripOfIllegalChars(storeData.id));

  if (
    storeData.oldStoreName &&
    storeData.oldStoreName !== storeData.id &&
    fs.existsSync(oldDir)
  ) {
    if (fs.existsSync(newDir)) {
      console.warn(`New store folder "${storeData.id}" already exists.`);
    }
    fs.renameSync(oldDir, newDir);
  } else if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true });
  }

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