import { z } from 'zod';

const optionalUrl = z
  .string()
  .url('Please enter a valid URL')
  .refine((url) => {
    return url.startsWith('http://') || url.startsWith('https://');
  }, 'URL must use HTTP or HTTPS protocol')
  .optional();

export const filamentSchema = z.object({
  id: z.string().optional(),
  name: z.string()
    .min(1, 'Filament ID is required')
    .max(1000),
  diameter_tolerance: z.coerce.number().positive(),
  density: z.coerce.number().positive(),
  shore_hardness_a: z.number().int().optional(),
  shore_hardness_d: z.number().int().optional(),
  certifications: z.array(z.string()).optional(),
  max_dry_temperature: z.number().int().optional(),
  min_print_temperature: z.number().int().optional(),
  max_print_temperature: z.number().int().optional(),
  preheat_temperature: z.number().int().optional(),
  min_bed_temperature: z.number().int().optional(),
  max_bed_temperature: z.number().int().optional(),
  min_chamber_temperature: z.number().int().optional(),
  max_chamber_temperature: z.number().int().optional(),
  chamber_temperature: z.number().int().optional(),
  min_nozzle_diameter: z.number().optional(),
  discontinued: z.boolean().default(false),
  data_sheet_url: optionalUrl,
  safety_sheet_url: optionalUrl,
});
