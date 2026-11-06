export interface Store {
	id: string;
	/** Canonical UUID (slug-independent); assigned by CI on merge, empty on create. */
	uuid?: string;
	/** Former canonical UUID(s) this entity had before a merge/move; old refs redirect here. */
	moved_from?: string[];
	slug?: string;
	name: string;
	storefront_url: string;
	logo: string;
	ships_from: string[] | string;
	ships_to: string[] | string;
}

export interface Brand {
	id: string;
	/** Canonical UUID (slug-independent); assigned by CI on merge, empty on create. */
	uuid?: string;
	/** Former canonical UUID(s) this entity had before a merge/move; old refs redirect here. */
	moved_from?: string[];
	slug?: string;
	name: string;
	/** One URL, or a list with the main site first. */
	website: string | string[];
	/** The full list, in the built dataset, when a brand has more than one site. */
	websites?: string[];
	logo: string;
	origin: string;
}

export interface Material {
	id: string; // Same as materialType, used for change tracking
	/** Canonical UUID (slug-independent); assigned by CI on merge, empty on create. */
	uuid?: string;
	/** Former canonical UUID(s) this entity had before a merge/move; old refs redirect here. */
	moved_from?: string[];
	slug?: string;
	material: string;
	material_class?: 'FFF' | 'SLA';
	default_max_dry_temperature?: number;
	default_slicer_settings?: any;
	brandId?: string;
	materialType?: string;
}

export interface Filament {
	id: string;
	/** Canonical UUID (slug-independent); assigned by CI on merge, empty on create. */
	uuid?: string;
	/** Former canonical UUID(s) this entity had before a merge/move; old refs redirect here. */
	moved_from?: string[];
	slug?: string;
	name: string;
	diameter_tolerance: number;
	density: number;
	shore_hardness_a?: number;
	shore_hardness_d?: number;
	certifications?: string[];
	max_dry_temperature?: number;
	min_print_temperature?: number;
	max_print_temperature?: number;
	preheat_temperature?: number;
	min_bed_temperature?: number;
	max_bed_temperature?: number;
	min_chamber_temperature?: number;
	max_chamber_temperature?: number;
	chamber_temperature?: number;
	min_print_speed?: number;
	max_print_speed?: number;
	max_volumetric_speed?: number;
	min_fan_speed?: number;
	max_fan_speed?: number;
	dry_temperature?: number;
	dry_time?: number;
	enclosure?: 'required' | 'recommended' | 'not_needed';
	min_nozzle_diameter?: number;
	data_sheet_url?: string;
	safety_sheet_url?: string;
	discontinued?: boolean;
	slicer_ids?: any;
	slicer_settings?: any;
	sustainability?: Sustainability;
	brandId?: string;
	materialType?: string;
	filamentDir?: string;
}

// --- Sustainability (schemas/sustainability_schema.json) ---------------------
// Every figure is copied verbatim from a cited source; see docs/manual.md.

export type SourceType = 'primary' | 'secondary';
export type PctQualifier = 'exact' | 'up_to' | 'at_least';

/** Fields every sourced sustainability entry carries. */
export interface SourcedEntry {
	source_type: SourceType;
	source_url: string;
	/** Verbatim text from the source; must contain the number as written. */
	source_quote: string;
	/** YYYY-MM-DD */
	retrieved: string;
	notes?: string | null;
}

export interface RecycledContent extends SourcedEntry {
	/** 0-100; null when the source gives no number. */
	pct: number | null;
	pct_qualifier?: PctQualifier;
	type: 'post_industrial' | 'post_consumer' | 'mixed' | 'unknown';
	evidence: 'iso_14021' | 'third_party_certified' | 'supplier_declaration' | 'marketing';
}

export interface BioBasedContent extends SourcedEntry {
	pct: number | null;
	pct_qualifier?: PctQualifier;
	method: 'astm_d6866' | 'en_16785' | 'declared';
}

export interface CarbonFootprint extends SourcedEntry {
	value_kg_co2e: number;
	declared_unit: 'per_kg_filament' | 'per_spool_as_sold' | 'unknown';
	boundary:
		| 'resin_cradle_to_gate'
		| 'filament_cradle_to_gate'
		| 'cradle_to_customer'
		| 'cradle_to_grave'
		| 'unknown';
	packaging_included: 'yes' | 'no' | 'unknown';
	biogenic_carbon: 'included' | 'excluded' | 'reported_separately' | 'unknown';
	recycled_allocation: 'cut_off' | 'burden_free_scrap' | 'other' | 'unknown' | 'not_applicable';
	method: 'epd' | 'iso_14067' | 'lca' | 'declaration';
	standard?: string | null;
	tool?: string | null;
	practitioner?: string | null;
	verification: 'none' | 'peer_review' | 'third_party' | 'epd_registered';
	verifier?: string | null;
	epd_registration_number?: string | null;
	/** false when the study is only available on request. */
	publicly_available: boolean;
	reference_year?: number | null;
	published?: string | null;
}

export interface RelativeClaim extends SourcedEntry {
	reduction_pct: number;
	metric: 'gwp' | 'other';
	/** Verbatim from the source. */
	baseline: string;
}

/**
 * On a variant, each field set here replaces the filament's field of the same name;
 * carbon_footprints and relative_claims replace the whole array.
 */
export interface Sustainability {
	recycled_content?: RecycledContent;
	bio_based_content?: BioBasedContent;
	carbon_footprints?: CarbonFootprint[];
	relative_claims?: RelativeClaim[];
}

export interface ContainerDetails extends SourcedEntry {
	recycled_pct?: number | null;
	pct_qualifier?: PctQualifier;
	certifications?: string[];
}

export interface PurchaseLink {
	store_id: string;
	url: string;
	ships_from?: string | string[];
	ships_to?: string | string[];
}

export interface VariantSize {
	/** Canonical UUID (slug-independent); assigned by CI on merge, empty on create. */
	uuid?: string;
	/** Former canonical UUID(s) this spool had before a merge/move; old refs redirect here. */
	moved_from?: string[];
	filament_weight: number;
	diameter: number;
	empty_spool_weight?: number;
	spool_core_diameter?: number;
	gtin?: string;
	article_number?: string;
	discontinued?: boolean;
	/** @deprecated Use `container_material: 'refill'`; read through `containerMaterialOf`. */
	spool_refill?: boolean;
	container_material?: ContainerMaterial;
	container_details?: ContainerDetails;
	purchase_links?: PurchaseLink[];
}

export type ContainerMaterial = 'plastic' | 'cardboard' | 'mixed' | 'refill';

export interface VariantTraits {
	translucent?: boolean;
	transparent?: boolean;
	matte?: boolean;
	silk?: boolean;
	glitter?: boolean;
	iridescent?: boolean;
	pearlescent?: boolean;
	neon?: boolean;
	glow?: boolean;
	without_pigments?: boolean;
	temperature_color_change?: boolean;
	gradual_color_change?: boolean;
	coextruded?: boolean;
	illuminescent_color_change?: boolean;
	recycled?: boolean;
	recyclable?: boolean;
	biodegradable?: boolean;
	home_compostable?: boolean;
	industrially_compostable?: boolean;
	bio_based?: boolean;
	abrasive?: boolean;
	foaming?: boolean;
	castable?: boolean;
	self_extinguishing?: boolean;
	high_temperature?: boolean;
	high_flow?: boolean;
	low_outgassing?: boolean;
	water_soluble?: boolean;
	ipa_soluble?: boolean;
	limonene_soluble?: boolean;
	esd_safe?: boolean;
	conductive?: boolean;
	emi_shielding?: boolean;
	paramagnetic?: boolean;
	biocompatible?: boolean;
	antibacterial?: boolean;
	air_filtering?: boolean;
	radiation_shielding?: boolean;
	filtration_recommended?: boolean;
	blend?: boolean;
	limited_edition?: boolean;
	contains_carbon?: boolean;
	contains_carbon_fiber?: boolean;
	contains_carbon_nano_tubes?: boolean;
	contains_glass?: boolean;
	contains_glass_fiber?: boolean;
	contains_kevlar?: boolean;
	contains_ptfe?: boolean;
	contains_ceramic?: boolean;
	contains_boron_carbide?: boolean;
	contains_stone?: boolean;
	contains_magnetite?: boolean;
	contains_organic_material?: boolean;
	contains_wood?: boolean;
	contains_cork?: boolean;
	contains_wax?: boolean;
	contains_algae?: boolean;
	contains_bamboo?: boolean;
	contains_pine?: boolean;
	contains_metal?: boolean;
	contains_bronze?: boolean;
	contains_iron?: boolean;
	contains_steel?: boolean;
	contains_silver?: boolean;
	contains_copper?: boolean;
	contains_aluminium?: boolean;
	contains_brass?: boolean;
	contains_tungsten?: boolean;
	imitates_wood?: boolean;
	imitates_metal?: boolean;
	imitates_marble?: boolean;
	imitates_stone?: boolean;
	lithophane?: boolean;
}

export interface Variant {
	id: string;
	/** Canonical UUID (slug-independent); assigned by CI on merge, empty on create. */
	uuid?: string;
	/** Former canonical UUID(s) this variant had before a merge/move; old refs redirect here. */
	moved_from?: string[];
	filament_id: string;
	slug: string;
	name: string;
	/** A single hex colour, or several for multi-colour variants (co-extruded, gradient…). */
	color_hex: string | string[];
	/** Transmission distance (TD) in mm, for HueForge/lithophanes. */
	transmission_distance?: number;
	discontinued: boolean;
	traits?: VariantTraits;
	/** Per-field override of the filament's sustainability data. */
	sustainability?: Sustainability;
	sizes?: VariantSize[];
	brandId?: string;
	materialType?: string;
	filamentDir?: string;
}

export interface DatabaseIndex {
	stores: Store[];
	brands: Brand[];
}
