import { z } from 'zod';

const functioningNumber = z.union([z.number(), z.nan()]).optional();

// Material types enum from material_types_schema.json
export const MATERIAL_TYPES = [
  "PLA", "PETG", "TPU", "ABS", "ASA", "PC", "PCTG", "PP",
  "PA6", "PA11", "PA12", "PA66", "CPE", "TPE", "HIPS", "PHA",
  "PET", "PEI", "PBT", "PVB", "PVA", "PEKK", "PEEK", "BVOH",
  "TPC", "PPS", "PPSU", "PVC", "PEBA", "PVDF", "PPA", "PCL",
  "PES", "PMMA", "POM", "PPE", "PS", "PSU", "TPI", "SBS",
  "OBC", "EVA"
] as const;

export const materialTypeSchema = z.enum(MATERIAL_TYPES);

export const genericSlicerSchema = z.object({
  first_layer_bed_temp: functioningNumber,
  first_layer_nozzle_temp: functioningNumber,
  bed_temp: functioningNumber,
  nozzle_temp: functioningNumber,
});

export const specificSlicerSchema = z.object({
  profile_name: z.string().optional()
}).merge(genericSlicerSchema);

export const slicerSettingsSchema = z.object({
  generic: genericSlicerSchema.optional(),
  prusaslicer: specificSlicerSchema.optional(),
  orcaslicer: specificSlicerSchema.optional(),
  bambustudio: specificSlicerSchema.optional(),
  cura: specificSlicerSchema.optional(),
});

export const materialClassSchema = z.enum(["FFF", "SLA"]).default("FFF");

export const filamentMaterialSchema = z
  .object({
    material: materialTypeSchema,
    material_class: materialClassSchema.optional(),
    default_max_dry_temperature: functioningNumber,
    default_slicer_settings: slicerSettingsSchema.optional()
  });
