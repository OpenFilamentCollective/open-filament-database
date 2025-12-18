import { z } from "zod";

// Maximum string length used across all schemas
const MAX_STRING_LENGTH = 1000;

// String type with a maximum length constraint.
export const LimitedStringSchema = z.string().max(1000);

// String type for ISO 3166-1 alpha-2 country codes.
export const CountryCodeSchema = z.union([z.string().length(2).regex(/^[A-Z]{2}$/), z.literal("Unknown")]);

// String or list of strings representing hex color codes.
export const ColorSchema = z.string().regex(/^#?[a-fA-F0-9]{6}$/);

// Either a single hex color code string or a list of such strings.
export const ColorsSchema = z.union([ColorSchema, z.array(ColorSchema)]);

// Store information for purchase links.
export const StoreSchema = z.object({
  id: LimitedStringSchema.describe("The ID for this store"),
  name: LimitedStringSchema.describe("The name of this store"),
  storefront_url: LimitedStringSchema.describe("A link to the storefront of this store"),
  storefront_affiliate_link: LimitedStringSchema.nullish().describe("An affiliate link to the storefront of this store"),
  logo: LimitedStringSchema.describe("A link to the logo for this store"),
  ships_from: z.union([z.array(CountryCodeSchema), CountryCodeSchema]).describe("A list of locations the shop linked ships from"),
  ships_to: z.union([z.array(CountryCodeSchema), CountryCodeSchema]).describe("A list of locations the shop linked ships to")
}).strict();

// Brand/manufacturer information.
export const BrandSchema = z.object({
  brand: LimitedStringSchema.describe("The name of the filament manufacture"),
  website: LimitedStringSchema.describe("The website of the filament manufacture"),
  logo: LimitedStringSchema.describe("A link to the logo for this brand"),
  origin: CountryCodeSchema.describe("The country of origin")
}).strict();

// Generic slicer settings that map to specific slicer configurations.
export const GenericSlicerSettingsSchema = z.object({
  first_layer_bed_temp: z.number().int().nullish(),
  first_layer_nozzle_temp: z.number().int().nullish(),
  bed_temp: z.number().int().nullish(),
  nozzle_temp: z.number().int().nullish()
}).strict();

// Settings for a specific slicer application.
export const SpecificSlicerSettingsSchema = z.object({
  profile_name: LimitedStringSchema.describe("The name of the profile for this filament. If there is a profile specifically for this filament, that is what should be specified, even if it is printer specific. For slic3r variants, data after the '@' does not need to be included and will be removed when loading into python."),
  overrides: z.record(z.string(), z.union([z.string(), z.array(z.string())])).nullish().describe("Key-value pairs for settings that should be overridden for this filament")
});

// Settings for various slicer applications.
export const SlicerSettingsSchema = z.object({
  prusaslicer: SpecificSlicerSettingsSchema.nullish(),
  bambustudio: SpecificSlicerSettingsSchema.nullish(),
  orcaslicer: SpecificSlicerSettingsSchema.nullish(),
  cura: SpecificSlicerSettingsSchema.nullish(),
  generic: GenericSlicerSettingsSchema.nullish().describe("Generic options that will automatically be mapped to the correct config definition for each slicer. Slicer specific settings are applied first, then these are applied on top.")
}).strict();

// Material type information.
export const MaterialSchema = z.object({
  material: LimitedStringSchema.describe("The material type of the filament"),
  default_max_dry_temperature: z.number().int().nullish(),
  default_slicer_settings: SlicerSettingsSchema.nullish().describe("The default slicer settings that should be used for this type of filament material. This will be used in any case where a filament does not specify its own \"slicer_settings\"")
}).strict();

// Slicer-specific IDs for the filament.
export const SlicerIDsSchema = z.object({
  prusaslicer: LimitedStringSchema.nullish(),
  bambustudio: LimitedStringSchema.nullish(),
  orcaslicer: LimitedStringSchema.nullish(),
  cura: LimitedStringSchema.nullish()
});

// Filament product line information.
export const FilamentSchema = z.object({
  name: LimitedStringSchema.describe("The manufacture's name for this filament"),
  diameter_tolerance: z.number().describe("The diameter tolerance of the filament (in mm)"),
  density: z.number().default(1.24).describe("The density of the filament (in g/cm³)"),
  max_dry_temperature: z.number().int().nullish(),
  data_sheet_url: LimitedStringSchema.nullish(),
  safety_sheet_url: LimitedStringSchema.nullish(),
  discontinued: z.boolean().nullish(),
  slicer_ids: SlicerIDsSchema.nullish(),
  slicer_settings: SlicerSettingsSchema.nullish().describe("The slicer settings that should be used for this filament. This will override what is set in \"default_slicer_settings\"")
}).strict();

// Standard color system identifiers.
export const ColorStandardsSchema = z.object({
  ral: LimitedStringSchema.nullish(),
  ncs: LimitedStringSchema.nullish(),
  pantone: LimitedStringSchema.nullish(),
  bs: LimitedStringSchema.nullish(),
  munsell: LimitedStringSchema.nullish()
});

// Physical and environmental traits of the filament.
export const TraitsSchema = z.object({
  translucent: z.boolean().nullish().describe("Indicates that the filament is translucent"),
  glow: z.boolean().nullish().describe("Indicates that the filament glows in the dark"),
  matte: z.boolean().nullish().describe("Indicates that the filament has a matte finish"),
  recycled: z.boolean().nullish().describe("Indicates that the filament was made of recycled materials"),
  recyclable: z.boolean().nullish().describe("Indicates that the filament can be recycled"),
  biodegradable: z.boolean().nullish().describe("Indicates if the filament will biodegrade")
}).strict();

// Color variant of a filament.
export const VariantSchema = z.object({
  color_name: LimitedStringSchema.describe("The manufacturer's name for this filament color"),
  color_hex: ColorsSchema.describe("The official hex color code for this filament"),
  hex_variants: z.array(ColorSchema).nullish().describe("Alternative hex color codes that this filament is known to report or be identified as (e.g., via NFC)"),
  discontinued: z.boolean().nullish(),
  color_standards: ColorStandardsSchema.nullish(),
  traits: TraitsSchema.nullish()
}).strict();

// Purchase link for a specific size.
export const PurchaseLinkSchema = z.object({
  store_id: LimitedStringSchema,
  url: LimitedStringSchema,
  affiliate: z.boolean(),
  spool_refill: z.boolean().default(false).describe("Indicates if this is a refill for a reusable spool"),
  ships_from: z.union([z.array(CountryCodeSchema), CountryCodeSchema]).nullish().describe("A list of locations the shop ships from. Defining this here will override the definition from the shop."),
  ships_to: z.union([z.array(CountryCodeSchema), CountryCodeSchema]).nullish().describe("A list of locations the shop ships to. Defining this here will override the definition from the shop.")
});

// Size/weight variant of a filament color.
export const FilamentSizeSchema = z.object({
  filament_weight: z.number().default(1000).describe("The weight of the filament alone (in grams)"),
  diameter: z.number().default(1.75).describe("The diameter of the filament (in mm)"),
  empty_spool_weight: z.number().nullish().describe("The weight of a spool with no filament (in grams)"),
  spool_core_diameter: z.number().nullish().describe("The diameter of the core of the spool"),
  ean: LimitedStringSchema.nullish(),
  article_number: LimitedStringSchema.nullish(),
  barcode_identifier: LimitedStringSchema.nullish(),
  nfc_identifier: LimitedStringSchema.nullish(),
  qr_identifier: LimitedStringSchema.nullish(),
  discontinued: z.boolean().nullish(),
  purchase_links: z.array(PurchaseLinkSchema).nullish().describe("A list of places to purchase this filament")
}).strict();

// Array of filament sizes - models the sizes.json schema.
export const FilamentSizeArraySchema = z.array(FilamentSizeSchema).min(1);

// TypeScript type exports
export type LimitedString = z.infer<typeof LimitedStringSchema>;
export type CountryCode = z.infer<typeof CountryCodeSchema>;
export type Color = z.infer<typeof ColorSchema>;
export type Colors = z.infer<typeof ColorsSchema>;
export type Store = z.infer<typeof StoreSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type GenericSlicerSettings = z.infer<typeof GenericSlicerSettingsSchema>;
export type SpecificSlicerSettings = z.infer<typeof SpecificSlicerSettingsSchema>;
export type SlicerSettings = z.infer<typeof SlicerSettingsSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type SlicerIDs = z.infer<typeof SlicerIDsSchema>;
export type Filament = z.infer<typeof FilamentSchema>;
export type ColorStandards = z.infer<typeof ColorStandardsSchema>;
export type Traits = z.infer<typeof TraitsSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type PurchaseLink = z.infer<typeof PurchaseLinkSchema>;
export type FilamentSize = z.infer<typeof FilamentSizeSchema>;
export type FilamentSizeArray = z.infer<typeof FilamentSizeArraySchema>;

