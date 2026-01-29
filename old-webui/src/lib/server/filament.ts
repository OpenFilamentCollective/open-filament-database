import { type z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { env } from "$env/dynamic/public";
import { filamentSchema } from '$lib/validation/filament-schema';
import { getIdFromName, removeUndefined } from '$lib/globalHelpers';

const DATA_DIR = env.PUBLIC_DATA_PATH;

export const createFilament = async (
  brandId: string,
  materialId: string,
  filamentData: z.infer<typeof filamentSchema>,
) => {
  const id = getIdFromName(filamentData.name);
  const brandDir = path.join(DATA_DIR, brandId);
  if (!fs.existsSync(brandDir)) {
    throw new Error(`Brand directory "${brandId}" does not exist.`);
  }

  const materialDir = path.join(brandDir, materialId);
  if (!fs.existsSync(materialDir)) {
    throw new Error(`Material directory "${materialId}" does not exist in brand "${brandId}".`);
  }

  const filamentDir = path.join(materialDir, id);
  if (fs.existsSync(filamentDir)) {
    throw new Error(`Filament "${id}" already exists in material "${materialId}" of brand ${brandId}.`);
  }

  try {
    fs.mkdirSync(filamentDir, { recursive: true });
    filamentData.id = id;

    const filamentJsonPath = path.join(filamentDir, 'filament.json');
    fs.writeFileSync(filamentJsonPath, JSON.stringify(filamentData, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error creating filament:', error);
    throw error;
  }
};

export function updateFilament(
  brandId: string,
  materialId: string,
  filamentData: any,
) {
  const brandDir = path.join(DATA_DIR, brandId);
  if (!fs.existsSync(brandDir)) {
    throw new Error(`Brand directory "${brandId}" does not exist.`);
  }

  const materialDir = path.join(brandDir, materialId);
  if (!fs.existsSync(materialDir)) {
    throw new Error(`Material directory "${materialId}" does not exist in brand "${brandId}".`);
  }

  const currentFilamentDir = path.join(materialDir, filamentData.id);
  if (!fs.existsSync(currentFilamentDir)) {
    throw new Error(
      `Filament directory "${filamentData.id}" not found in material "${materialId}"`,
    );
  }

  const filamentJsonPath = path.join(currentFilamentDir, 'filament.json');

  const transformedData = transformFilamentData(filamentData);
  fs.writeFileSync(filamentJsonPath, JSON.stringify(transformedData, null, 2), 'utf-8');
  console.log(`Filament updated: ${brandId}/${materialId}/${filamentData.id}`);
}

function transformFilamentData(filamentData: any) {
  const transformedData: any = {
    id: filamentData.id,
    name: filamentData.name,
  };

  // Add filament-specific properties
  if (filamentData.diameter_tolerance !== undefined) {
    transformedData.diameter_tolerance = filamentData.diameter_tolerance;
  }
  if (filamentData.density !== undefined) {
    transformedData.density = filamentData.density;
  }
  if (filamentData.max_dry_temperature !== undefined) {
    transformedData.max_dry_temperature = filamentData.max_dry_temperature;
  }
  if (filamentData.data_sheet_url !== undefined) {
    transformedData.data_sheet_url = filamentData.data_sheet_url;
  }
  if (filamentData.safety_sheet_url !== undefined) {
    transformedData.safety_sheet_url = filamentData.safety_sheet_url;
  }
  if (filamentData.discontinued !== undefined) {
    transformedData.discontinued = filamentData.discontinued;
  }

  // // Add slicer profile paths if they exist
  // if (filamentData.prusa_profile_path !== undefined) {
  //   transformedData.prusa_profile_path = filamentData.prusa_profile_path;
  // }
  // if (filamentData.bambus_profile_path !== undefined) {
  //   transformedData.bambus_profile_path = filamentData.bambus_profile_path;
  // }
  // if (filamentData.orca_profile_path !== undefined) {
  //   transformedData.orca_profile_path = filamentData.orca_profile_path;
  // }
  // if (filamentData.cura_profile_path !== undefined) {
  //   transformedData.cura_profile_path = filamentData.cura_profile_path;
  // }

  return removeUndefined(transformedData);
}