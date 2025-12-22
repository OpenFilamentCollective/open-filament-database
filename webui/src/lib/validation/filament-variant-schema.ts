import { z } from 'zod';

export const purchaseLinkSchema = z.object({
  store_id: z.string(),
  url: z
    .string()
    .url('Please enter a valid URL')
    .refine((url) => {
      return url.startsWith('http://') || url.startsWith('https://');
    }, 'URL must use HTTP or HTTPS protocol')
    .default('https://'),
  spool_refill: z.boolean().optional(),
  ships_from: z.union([z.string(), z.array(z.string())]).optional(),
  ships_to: z.union([z.string(), z.array(z.string())]).optional(),
});

export const filamentSizeSchema = z.object({
  filament_weight: z.number(),
  diameter: z.number(),
  empty_spool_weight: z.number().nullable().optional(),
  spool_core_diameter: z.number().nullable().optional(),
  gtin: z.string().max(1000).optional(),
  ean: z.string().optional(),
  article_number: z.string().optional(),
  discontinued: z.boolean().default(false),
  purchase_links: z.array(purchaseLinkSchema).optional(),
});

export const traitsSchema = z.object({
  translucent: z.boolean().optional(),
  glow: z.boolean().optional(),
  matte: z.boolean().optional(),
  recycled: z.boolean().optional(),
  recyclable: z.boolean().optional(),
  biodegradable: z.boolean().optional(),
});

export const filamentSizesSchema = z.array(filamentSizeSchema).min(1);
export const purchaseLinksSchema = z.array(purchaseLinkSchema);

export const filamentVariantHex = z.string().regex(/^#?[a-fA-F0-9]{6}$/, 'Must be a valid hex code (#RRGGBB)');

export const filamentVariantSchema = z.object({
  color_name: z.string(),
  color_hex: z.union([filamentVariantHex, z.array(filamentVariantHex).min(1)]).default(""),
  discontinued: z.boolean().default(false),
  traits: traitsSchema.optional(),
  sizes: filamentSizesSchema,
});
