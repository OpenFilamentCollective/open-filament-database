import { type z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { env } from "$env/dynamic/public";
import type { filamentSizesSchema, filamentVariantSchema, purchaseLinksSchema } from '$lib/validation/filament-variant-schema';

const DATA_DIR = env.PUBLIC_DATA_PATH;

export const createVariant = async (
  brandName: string,
  materialName: string,
  filamentName: string,
  variantData: z.infer<typeof filamentVariantSchema>,
) => {
  const variantDir = path.join(DATA_DIR, brandName, materialName, filamentName, variantData.color_name);
  if (fs.existsSync(variantDir)) {
    throw new Error(`Variant "${variantData.color_name}" already exists in filament "${filamentName}".`);
  }

  try {
    fs.mkdirSync(variantDir, { recursive: true });

    const variantJsonPath = path.join(variantDir, 'variant.json');
    const sizesJsonPath = path.join(variantDir, 'sizes.json');
    const transformedData = transformVariant(variantData);

    fs.writeFileSync(variantJsonPath, JSON.stringify(transformedData.variant, null, 2), 'utf-8');
    fs.writeFileSync(sizesJsonPath, JSON.stringify(transformedData.sizes, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error creating filament:', error);
    throw error;
  }
}

export async function updateVariant(
  brandName: string,
  materialName: string,
  filamentName: string,
  variantName: string,
  variantData: any,
) {
  const variantDir = path.join(DATA_DIR, brandName, materialName, filamentName, variantName);

  if (!fs.existsSync(variantDir)) {
    throw new Error(`Variant directory "${variantName}" not found in filament "${filamentName}"`);
  }

  try {
    let variantJsonPath: string, sizesJsonPath: string;

    // Check if the color name has changed and requires folder rename
    if (variantData.color_name !== variantName) {
      const newVariantDir = path.join(
        DATA_DIR,
        brandName,
        materialName,
        filamentName,
        variantData.color_name,
      );

      if (fs.existsSync(newVariantDir)) {
        throw new Error(
          `Variant "${variantData.color_name}" already exists in filament "${filamentName}"`,
        );
      }

      fs.renameSync(variantDir, newVariantDir);

      console.log(
        `Variant updated and renamed: ${brandName}/${materialName}/${filamentName}/${variantName} -> ${variantData.color_name}`,
      );

      variantJsonPath = path.join(newVariantDir, 'variant.json');
      sizesJsonPath = path.join(newVariantDir, 'sizes.json');
    } else {
      variantJsonPath = path.join(variantDir, 'variant.json');
      sizesJsonPath = path.join(variantDir, 'sizes.json');
    }

    const transformedData = transformVariant(variantData);

    // Update the variant.json in whatever location
    fs.writeFileSync(variantJsonPath, JSON.stringify(transformedData.variant, null, 2), 'utf-8');
    fs.writeFileSync(sizesJsonPath, JSON.stringify(transformedData.sizes, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error updating color variant:', error);
    throw error;
  }
}

export async function deleteColorSize(
  brandName: string,
  materialName: string,
  filamentName: string,
  colorName: string,
  sizeIndex: number,
) {
  const colorDir = path.join(DATA_DIR, brandName, materialName, filamentName, colorName);

  if (!fs.existsSync(colorDir)) {
    throw new Error(`Color directory "${colorName}" not found in filament "${filamentName}"`);
  }

  try {
    const sizesPath = path.join(colorDir, 'sizes.json');

    if (!fs.existsSync(sizesPath)) {
      throw new Error('No sizes.json file found');
    }

    let sizesArr: any[] = [];
    try {
      sizesArr = JSON.parse(fs.readFileSync(sizesPath, 'utf-8'));
      if (!Array.isArray(sizesArr)) {
        throw new Error('Invalid sizes.json format');
      }
    } catch {
      throw new Error('Could not parse sizes.json');
    }

    if (sizeIndex < 0 || sizeIndex >= sizesArr.length) {
      throw new Error(`Size index ${sizeIndex} is out of range`);
    }

    sizesArr.splice(sizeIndex, 1);

    fs.writeFileSync(sizesPath, JSON.stringify(sizesArr, null, 2), 'utf-8');
    console.log(
      `Size deleted at index ${sizeIndex}: ${brandName}/${materialName}/${filamentName}/${colorName}`,
    );
  } catch (error) {
    console.error('Error deleting color size:', error);
    throw error;
  }
}

type variantReturnObject = {
  variant: Object,
  sizes: Object
};

function transformVariant(variantData: z.infer<typeof filamentVariantSchema>): variantReturnObject {
  const tempData: any = {
    color_name: variantData.color_name,
    color_hex: variantData.color_hex,
  };
  let sizes = transformSizes(variantData.sizes);

  const traits: Record<string, boolean> = {};

  if (variantData?.traits) {
    Object.keys(variantData.traits).forEach((key, index) => {
      if (variantData.traits[key] !== undefined) {
        traits[key] = variantData.traits[key];
      }
    });
  }
  // Only include traits if at least one is present
  if (Object.keys(traits).length > 0) {
    tempData.traits = traits;
  }
  
  // Add any additional fields you want in variant.json
  if (variantData.discontinued) tempData.discontinued = tempData.discontinued;

  return {
    variant: tempData,
    sizes: sizes
  };
}

function transformSizes(sizeData: z.infer<typeof filamentSizesSchema>) {
  let tempSizes: z.infer<typeof filamentSizesSchema> = [];

  if (!Array.isArray(sizeData)) {
    // Somewhere we broke it if the instance is single, I blame Zod
    sizeData = [
      sizeData
    ];
  }

  Array.from(sizeData).forEach((value, index) => {
    let tempData = value;

    // Reinforce required data
    tempData.diameter = tempData?.diameter ? tempData.diameter : 0;
    tempData.filament_weight = tempData?.filament_weight ? tempData.filament_weight : 0;

    if (value?.purchase_links && Array.isArray(value?.purchase_links)) {
      let tempLinks: z.infer<typeof purchaseLinksSchema> = [];

      Array.from(value.purchase_links).forEach((link, index) => {
        let tempLink = structuredClone(link);

        tempLinks[index] = tempLink;
      });

      tempData.purchase_links = tempLinks;
    };
    
    tempSizes[index] = tempData;
  });

  return tempSizes;
}