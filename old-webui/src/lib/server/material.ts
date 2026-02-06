import { type z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { env } from "$env/dynamic/public";
import { filamentMaterialSchema } from "$lib/validation/filament-material-schema";
import { isEmptyObject, removeEmptyObjects, removeUndefined } from '$lib/globalHelpers';

const DATA_DIR = env.PUBLIC_DATA_PATH;

export const createMaterial = async (
  brandName: string,
  materialData: z.infer<typeof filamentMaterialSchema>,
) => {
  const brandDir = path.join(DATA_DIR, brandName);
  if (!fs.existsSync(brandDir)) {
    throw new Error(`Brand directory "${brandName}" does not exist.`);
  }

  const materialDir = path.join(brandDir, materialData.material);
  if (fs.existsSync(materialDir)) {
    throw new Error(`Material "${materialData.material}" already exists in brand "${brandName}".`);
  }

  try {
    fs.mkdirSync(materialDir, { recursive: true });

    const materialJsonPath = path.join(materialDir, 'material.json');
    const transformedData = transformMaterialData(materialData);

    fs.writeFileSync(materialJsonPath, JSON.stringify(transformedData, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error creating material:', error);
    throw error;
  }
};

export function updateMaterial(brandName: string, currentMaterialName: string, materialData: any) {
  const brandDir = path.join(DATA_DIR, brandName);

  if (!fs.existsSync(brandDir)) {
    throw new Error(`Brand directory "${brandName}" does not exist.`);
  }

  const currentMaterialDir = path.join(brandDir, currentMaterialName);

  if (!fs.existsSync(currentMaterialDir)) {
    throw new Error(
      `Material directory "${currentMaterialName}" not found in brand "${brandName}"`,
    );
  }

  try {
    if (materialData.material !== currentMaterialName) {
      const newMaterialDir = path.join(brandDir, materialData.material);

      if (fs.existsSync(newMaterialDir)) {
        throw new Error(
          `Material "${materialData.material}" already exists in brand "${brandName}"`,
        );
      }

      fs.renameSync(currentMaterialDir, newMaterialDir);

      const materialJsonPath = path.join(newMaterialDir, 'material.json');
      const transformedData = transformMaterialData(materialData);

      fs.writeFileSync(materialJsonPath, JSON.stringify(transformedData, null, 2), 'utf-8');
    } else {
      const materialJsonPath = path.join(currentMaterialDir, 'material.json');

      const transformedData = transformMaterialData(materialData);

      fs.writeFileSync(materialJsonPath, JSON.stringify(transformedData, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('Error updating material:', error);
    throw error;
  }
}

function transformGeneric(slicer_settings: any) {
  let genericSettings: any = {};

  genericSettings.first_layer_bed_temp = slicer_settings.first_layer_bed_temp || null;

  genericSettings.first_layer_nozzle_temp = slicer_settings.first_layer_nozzle_temp || null;

  genericSettings.bed_temp = slicer_settings.bed_temp || null;

  genericSettings.nozzle_temp = slicer_settings.nozzle_temp || null;

  // Only return object if it has properties
  if (!isEmptyObject(genericSettings)) {
    return genericSettings;
  } else {
    return null;
  }
}

function transformSpecific(slicer_settings: any) {
  let genericSettings: any = {};

  genericSettings = transformGeneric(slicer_settings);

  genericSettings.profile_name = slicer_settings.profile_name || null;

  // Only return object if it has properties
  if (!isEmptyObject(genericSettings)) {
    return genericSettings;
  } else {
    return null;
  }
}

export function transformMaterialData(materialData: any) {
  let transformedData: any = {
    material: materialData.material,
  };

  if (materialData?.default_max_dry_temperature) {
    transformedData.default_max_dry_temperature = materialData.default_max_dry_temperature;
  }

  let default_slicer_settings: any = {}

  if (!isEmptyObject(materialData?.default_slicer_settings)) {
    let slicer_settings = materialData.default_slicer_settings;

    // Handle generic settings
    if (slicer_settings?.generic) {
      let genericSettings = transformGeneric(slicer_settings.generic);
      if (genericSettings) {
        default_slicer_settings.generic = genericSettings;
      }
    }

    // Handle PrusaSlicer settings
    if (slicer_settings?.prusaslicer) {
      let prusaslicerSettings = transformSpecific(slicer_settings.prusaslicer);
      if (prusaslicerSettings) {
        default_slicer_settings.prusaslicer = prusaslicerSettings;
      }
    }

    // Handle Bambu settings
    if (slicer_settings?.bambustudio) {
      let bambuSettings = transformSpecific(slicer_settings.bambustudio);
      if (bambuSettings) {
        default_slicer_settings.bambustudio = bambuSettings;
      }
    }

    // Handle Orca Slicer settings
    if (slicer_settings?.orcaslicer) {
      let orcaslicerSettings = transformSpecific(slicer_settings.orcaslicer);
      if (orcaslicerSettings) {
        default_slicer_settings.orcaslicer = orcaslicerSettings;
      }
    }

    // Handle Cura settings
    if (slicer_settings?.cura) {
      let curaSettings = transformSpecific(slicer_settings.cura);
      if (curaSettings) {
        default_slicer_settings.cura = curaSettings;
      }
    }
  }

  if (!isEmptyObject(default_slicer_settings)) {
    transformedData.default_slicer_settings = default_slicer_settings;
  }

  transformedData = removeUndefined(transformedData);

  if (transformedData.default_slicer_settings) {
    Object.keys(transformedData.default_slicer_settings).forEach(key => {
      if (isEmptyObject(transformedData.default_slicer_settings[key])) {
        delete transformedData.default_slicer_settings[key];
      }
    });
  }

  return transformedData;
}