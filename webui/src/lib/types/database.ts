export interface Store {
	id: string;
	slug?: string;
	name: string;
	storefront_url: string;
	logo: string;
	ships_from: string[] | string;
	ships_to: string[] | string;
}

export interface Brand {
	id: string;
	slug?: string;
	name: string;
	website: string;
	logo: string;
	origin: string;
}

export interface Material {
	id: string; // Same as materialType, used for change tracking
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
	min_nozzle_diameter?: number;
	data_sheet_url?: string;
	safety_sheet_url?: string;
	discontinued?: boolean;
	slicer_ids?: any;
	slicer_settings?: any;
	brandId?: string;
	materialType?: string;
	filamentDir?: string;
}

export interface PurchaseLink {
	store_id: string;
	url: string;
	ships_from?: string | string[];
	ships_to?: string | string[];
}

export interface VariantSize {
	filament_weight: number;
	diameter: number;
	empty_spool_weight?: number;
	spool_core_diameter?: number;
	gtin?: string;
	article_number?: string;
	discontinued?: boolean;
	spool_refill?: boolean;
	purchase_links?: PurchaseLink[];
}

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
	filament_id: string;
	slug: string;
	name: string;
	color_hex: string;
	discontinued: boolean;
	traits?: VariantTraits;
	sizes?: VariantSize[];
	brandId?: string;
	materialType?: string;
	filamentDir?: string;
}

export interface DatabaseIndex {
	stores: Store[];
	brands: Brand[];
}
