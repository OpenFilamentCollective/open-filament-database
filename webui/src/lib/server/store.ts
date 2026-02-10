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

  // Handle logo upload if it's a new file
  let logoUrl = '';
  if (
    storeData.logo &&
    typeof storeData.logo === 'object' &&
    typeof storeData.logo.arrayBuffer === 'function'
  ) {
    // New logo uploaded
    const arrayBuffer = await storeData.logo.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = getLogoName(storeData.logo.name);
    const logoPath = path.join(newDir, fileName);

    // Ensure directory exists
    try {
      fs.mkdirSync(newDir, { recursive: true });
    } catch (err) {
      console.warn('Could not create store directory:', err);
    }

    // Delete existing logo files before writing the new one
    try {
      const files = fs.readdirSync(newDir);
      for (const file of files) {
        if (
          !file.startsWith('.') &&
          file.toLowerCase().match(/\.(jpg|jpeg|png|gif|svg)$/)
        ) {
          const p = path.join(newDir, file);
          try {
            fs.unlinkSync(p);
          } catch (e) {
            console.warn(`Failed to delete existing logo file ${p}:`, e);
          }
        }
      }
    } catch (err) {
      console.warn('Could not read existing files to remove logos:', err);
    }

    fs.writeFileSync(logoPath, buffer);
    logoUrl = fileName;
  } else if (typeof storeData.logo === 'string') {
    // Existing logo URL
    logoUrl = storeData.logo;
  } else {
    // Try to find existing logo in the directory
    try {
      const files = fs.readdirSync(newDir);
      const logoFile = files.find(
        (file) => file.toLowerCase().match(/\.(jpg|jpeg|png|gif|svg)$/) && !file.startsWith('.'),
      );
      if (logoFile) {
        logoUrl = logoFile;
      }
    } catch (error) {
      console.warn('Could not find existing logo:', error);
    }
  }

  const storeJson = {
    id: storeData.id,
    name: storeData.name,
    storefront_url: storeData.storefront_url,
    logo: logoUrl,
    ships_from: storeData.ships_from,
    ships_to: storeData.ships_to,
  };

  const storeJsonPath = path.join(newDir, 'store.json');
  fs.writeFileSync(storeJsonPath, JSON.stringify(storeJson, null, 2), 'utf-8');

  console.log(`Store updated: ${storeData.oldStoreName} -> ${storeData.name}`);
  return newDir;
}