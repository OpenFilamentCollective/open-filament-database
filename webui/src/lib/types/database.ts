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
	material: string;
	material_class?: 'FFF' | 'SLA';
	default_max_dry_temperature?: number;
	default_slicer_settings?: any;
	brandId?: string;
	materialType?: string;
}

export interface Filament {
	id: string;
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

export interface Variant {
	id: string;
	filament_id: string;
	slug: string;
	color_name: string;
	color_hex: string;
	discontinued: boolean;
	brandId?: string;
	materialType?: string;
	filamentDir?: string;
}

export interface DatabaseIndex {
	stores: Store[];
	brands: Brand[];
}
