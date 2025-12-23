import { brandSchema } from "$lib/validation/filament-brand-schema";
import { stripOfIllegalChars } from "$lib/globalHelpers";
import * as fs from 'node:fs';
import * as path from 'node:path';
import { env } from "$env/dynamic/public";
import { type z } from 'zod';

const DATA_DIR = env.PUBLIC_DATA_PATH;

export const pseudoCreateBrand = async (brandData: z.infer<typeof brandSchema>) => {
  let tempData = structuredClone(brandData);

  if (
    brandData.logo &&
    typeof brandData.logo === 'object' &&
    typeof brandData.logo.arrayBuffer === 'function'
  ) {
    const arrayBuffer = await brandData.logo.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    tempData.logoData = buffer.toString("base64");
    tempData.logo = `${brandData.logo.name}`;
  }

  return tempData;
};

export const createBrand = async (brandData: z.infer<typeof brandSchema>) => {
  let folderName = stripOfIllegalChars(brandData.brand);

  const brandDir = path.join(DATA_DIR, folderName);
  if (fs.existsSync(brandDir)) {
    throw new Error(`Brand ${brandData.brand} already exists.`);
  }

  try {
    fs.mkdirSync(brandDir, { recursive: true });

    let logoPath = '';
    let logoUrl = '';
    if (
      brandData.logo &&
      typeof brandData.logo === 'object' &&
      typeof brandData.logo.arrayBuffer === 'function'
    ) {
      const arrayBuffer = await brandData.logo.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      logoPath = path.join(brandDir, brandData.logo.name);
      fs.writeFileSync(logoPath, buffer);
      logoUrl = `${brandData.logo.name}`;
    }

    const brandJson = {
      brand: brandData.brand,
      website: brandData.website,
      logo: logoUrl,
      origin: brandData.origin
    };

    const brandJsonPath = path.join(brandDir, 'brand.json');
    fs.writeFileSync(brandJsonPath, JSON.stringify(brandJson, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error creating brand:', error);
    throw error;
  }
};

export const updateBrand = async (brandData: z.infer<typeof brandSchema>) => {
  const oldDir = path.join(DATA_DIR, stripOfIllegalChars(brandData.oldBrandName || brandData.brand));
  const newDir = path.join(DATA_DIR, stripOfIllegalChars(brandData.brand));

  if (
    brandData.oldBrandName &&
    brandData.oldBrandName !== brandData.brand &&
    fs.existsSync(oldDir)
  ) {
    if (fs.existsSync(newDir)) {
      console.warn(`Brand folder "${brandData.brand}" already exists.`);
    }
    fs.renameSync(oldDir, newDir);
  } else if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true });
  }

  // Handle logo upload if it's a new file
  let logoUrl = '';
  if (
    brandData.logo &&
    typeof brandData.logo === 'object' &&
    typeof brandData.logo.arrayBuffer === 'function'
  ) {
    // New logo uploaded
    const arrayBuffer = await brandData.logo.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const logoPath = path.join(newDir, brandData.logo.name);
    fs.writeFileSync(logoPath, buffer);
    logoUrl = `/data/${brandData.brand}/${brandData.logo.name}`;
  } else if (typeof brandData.logo === 'string') {
    // Existing logo URL
    logoUrl = brandData.logo;
  } else {
    // Try to find existing logo in the directory
    try {
      const files = fs.readdirSync(newDir);
      const logoFile = files.find(
        (file) => file.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/i) && !file.startsWith('.'),
      );
      if (logoFile) {
        logoUrl = `/data/${brandData.brand}/${logoFile}`;
      }
    } catch (error) {
      console.warn('Could not find existing logo:', error);
    }
  }

  const brandJson = {
    brand: brandData.brand,
    website: brandData.website,
    logo: logoUrl,
    origin: brandData.origin,
  };

  const brandJsonPath = path.join(newDir, 'brand.json');
  fs.writeFileSync(brandJsonPath, JSON.stringify(brandJson, null, 2), 'utf-8');

  console.log(`Brand updated: ${brandData.oldBrandName || brandData.brand} -> ${brandData.brand}`);
  return newDir;
}