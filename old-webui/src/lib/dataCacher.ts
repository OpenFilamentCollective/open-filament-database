import { loadFilamentDatabase } from './jsonParser';
import { getEditedItem, isItemEdited } from './pseudoEditor';
import { browser } from '$app/environment';
import path from 'node:path';
import type { FilamentDatabase } from './jsonParser';
import { isItemDeleted } from './pseudoDeleter';
import { env } from '$env/dynamic/public';

let cachedDatabase: FilamentDatabase | null = null;
let loadingPromise: Promise<FilamentDatabase> | null = null;

export async function getFilamentDatabase(): Promise<FilamentDatabase> {
  if (cachedDatabase) {
    return browser ? applyPseudoEdits(cachedDatabase) : cachedDatabase;
  }

  if (loadingPromise) {
    const database = await loadingPromise;
    return browser ? applyPseudoEdits(database) : database;
  }

  loadingPromise = loadDatabase();
  const database = await loadingPromise;
  cachedDatabase = database;
  loadingPromise = null;

  return browser ? applyPseudoEdits(database) : database;
}

async function loadDatabase(): Promise<FilamentDatabase> {
  const dataPath = path.resolve(env.PUBLIC_DATA_PATH);
  const storesPath = path.resolve(env.PUBLIC_STORES_PATH);
  console.log(`Loading database from: ${dataPath} and stores from ${storesPath}`);
  return await loadFilamentDatabase(dataPath, storesPath);
}

function applyPseudoEdits(database: FilamentDatabase): FilamentDatabase {
  console.log('Applying pseudo edits and deletes to database (browser-side)');

  if (!browser || typeof localStorage === 'undefined') {
    console.log('Not in browser or localStorage not available, returning original database');
    return database;
  }

  const editedDatabase = JSON.parse(JSON.stringify(database));
  console.log('Database cloned for pseudo edits and deletes');

  const filteredBrands: { [key: string]: any } = {};

  for (const [brandKey, brand] of Object.entries(editedDatabase.brands)) {
    if (isItemDeleted('brand', brandKey)) {
      console.log(`Brand ${brandKey} is deleted, skipping`);
      continue;
    }

    if (isItemEdited('brand', brandKey)) {
      const editedData = getEditedItem('brand', brandKey);
      if (editedData) {
        console.log(`Applying brand edit for ${brandKey}:`, editedData);
        Object.assign(brand, editedData);
      }
    }

    const filteredMaterials: { [key: string]: any } = {};

    for (const [materialKey, material] of Object.entries(brand.materials)) {
      if (isItemDeleted('material', materialKey, brandKey)) {
        console.log(`Material ${brandKey}/${materialKey} is deleted, skipping`);
        continue;
      }

      if (isItemEdited('material', brandKey, materialKey)) {
        const editedData = getEditedItem('material', brandKey, materialKey);
        if (editedData) {
          console.log(`Applying material edit for ${brandKey}/${materialKey}:`, editedData);
          Object.assign(material, editedData);
        }
      }

      const filteredFilaments: { [key: string]: any } = {};

      for (const [filamentKey, filament] of Object.entries(material.filaments)) {
        if (isItemDeleted('filament', filamentKey, brandKey, materialKey)) {
          console.log(`Filament ${brandKey}/${materialKey}/${filamentKey} is deleted, skipping`);
          continue;
        }

        if (isItemEdited('filament', brandKey, materialKey, filamentKey)) {
          const editedData = getEditedItem('filament', brandKey, materialKey, filamentKey);
          if (editedData) {
            console.log(
              `Applying filament edit for ${brandKey}/${materialKey}/${filamentKey}:`,
              editedData,
            );
            Object.assign(filament, editedData);
          }
        }

        const filteredColors: { [key: string]: any } = {};

        for (const [colorKey, color] of Object.entries(filament.colors)) {
          if (isItemDeleted('instance', colorKey, brandKey, materialKey, filamentKey)) {
            console.log(
              `Instance ${brandKey}/${materialKey}/${filamentKey}/${colorKey} is deleted, skipping`,
            );
            continue;
          }

          if (isItemEdited('color_variant', brandKey, materialKey, filamentKey, colorKey)) {
            const editedVariantData = getEditedItem(
              'color_variant',
              brandKey,
              materialKey,
              filamentKey,
              colorKey,
            );
            if (editedVariantData && color.variant) {
              console.log(
                `Applying variant edit for ${brandKey}/${materialKey}/${filamentKey}/${colorKey}:`,
                editedVariantData,
              );
              Object.assign(color.variant, editedVariantData);
            }
          }

          if (isItemEdited('color_size', brandKey, materialKey, filamentKey, colorKey)) {
            const editedSizeData = getEditedItem(
              'color_size',
              brandKey,
              materialKey,
              filamentKey,
              colorKey,
            );
            if (editedSizeData && color.sizes && color.sizes.length > 0) {
              console.log(
                `Applying size edit for ${brandKey}/${materialKey}/${filamentKey}/${colorKey}:`,
                editedSizeData,
              );
              // Replace the first size object with the edited version
              color.sizes[0] = { ...color.sizes[0], ...editedSizeData };
            }
          }

          filteredColors[colorKey] = color;
        }

        filament.colors = filteredColors;

        if (Object.keys(filteredColors).length > 0) {
          filteredFilaments[filamentKey] = filament;
        }
      }

      material.filaments = filteredFilaments;

      if (Object.keys(filteredMaterials).length > 0) {
        filteredMaterials[materialKey] = material;
      }
    }

    brand.materials = filteredMaterials;

    if (Object.keys(filteredMaterials).length > 0) {
      filteredBrands[brandKey] = brand;
    }
  }

  editedDatabase.brands = filteredBrands;

  console.log('Pseudo edits and deletes applied successfully, returning edited database');
  return editedDatabase;
}

// Optional: Function to refresh cache if needed during development
export function clearCache() {
  cachedDatabase = null;
  loadingPromise = null;
}

export async function refreshDatabase(): Promise<FilamentDatabase> {
  clearCache();
  return await getFilamentDatabase();
}
