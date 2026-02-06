import { brandSchema } from "$lib/validation/filament-brand-schema";
import { getIdFromName, getLogoName, stripOfIllegalChars } from "$lib/globalHelpers";
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
    tempData.logo = getLogoName(brandData.logo.name);
  }

  return tempData;
};

export const createBrand = async (brandData: z.infer<typeof brandSchema>) => {
  const id = getIdFromName(brandData.name);
  // Prefer `id` for folder names, fall back to sanitized `name`.
  const brandDir = path.join(DATA_DIR, id);
  if (fs.existsSync(brandDir)) {
    throw new Error(`Brand ${brandData.name || brandData.brand} already exists.`);
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
      logoUrl = `${getLogoName(brandData.logo.name)}`;
      logoPath = path.join(brandDir, logoUrl);
      fs.writeFileSync(logoPath, buffer);
    }

    const brandJson: any = {
      id: id,
      name: brandData.name,
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
  const newDir = path.join(DATA_DIR, stripOfIllegalChars(brandData.id));

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
    const fileName = getLogoName(brandData.logo.name);
    const logoPath = path.join(newDir, fileName);

    // Ensure directory exists
    try {
      fs.mkdirSync(newDir, { recursive: true });
    } catch (err) {
      console.warn('Could not create brand directory:', err);
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
      // Directory may be empty or unreadable; ignore
      console.warn('Could not read existing files to remove logos:', err);
    }

    fs.writeFileSync(logoPath, buffer);
    logoUrl = `${fileName}`;
  } else if (typeof brandData.logo === 'string') {
    // Existing logo URL
    logoUrl = brandData.logo;
  } else {
    // Try to find existing logo in the directory
    try {
      const files = fs.readdirSync(newDir);
      const logoFile = files.find(
        (file) => file.toLowerCase().match(/\.(jpg|jpeg|png|gif|svg)$/) && !file.startsWith('.'),
      );
      if (logoFile) {
        logoUrl = `${logoFile}`;
      }
    } catch (error) {
      console.warn('Could not find existing logo:', error);
    }
  }

  const brandJson: any = {
    id: brandData.id,
    name: brandData.name,
    website: brandData.website,
    logo: logoUrl,
    origin: brandData.origin,
  };

  const brandJsonPath = path.join(newDir, 'brand.json');
  fs.writeFileSync(brandJsonPath, JSON.stringify(brandJson, null, 2), 'utf-8');

  console.log(`Brand updated: ${brandData.name} -> ${brandJson.name}`);
  return newDir;
}