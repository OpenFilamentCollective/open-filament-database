/**
 * Trait configuration for filament variants
 * Extracted from VariantForm for reuse across the application
 */

export interface TraitDefinition {
	key: string;
	label: string;
	description: string;
}

export interface TraitCategory {
	label: string;
	traits: TraitDefinition[];
}

export const TRAIT_CATEGORIES: Record<string, TraitCategory> = {
	appearance: {
		label: 'Appearance',
		traits: [
			{ key: 'translucent', label: 'Translucent', description: 'The filament is translucent' },
			{
				key: 'transparent',
				label: 'Transparent',
				description: 'Not fully opaque, glass-like transparency'
			},
			{ key: 'matte', label: 'Matte', description: 'Has a matte finish' },
			{ key: 'silk', label: 'Silk', description: 'Produces smooth, shiny/glossy surface' },
			{ key: 'glitter', label: 'Glitter', description: 'Contains coarse glitter particles' },
			{
				key: 'iridescent',
				label: 'Iridescent',
				description: 'Changes color based on viewing angle'
			},
			{ key: 'pearlescent', label: 'Pearlescent', description: 'Reflected light is mostly white' },
			{ key: 'neon', label: 'Neon/UV', description: 'Neon color/glows under UV light' },
			{ key: 'glow', label: 'Glow in Dark', description: 'Glows in the dark' },
			{
				key: 'without_pigments',
				label: 'Natural',
				description: 'No pigments added, natural color'
			}
		]
	},
	color_effects: {
		label: 'Color Effects',
		traits: [
			{
				key: 'temperature_color_change',
				label: 'Thermochromic',
				description: 'Changes color based on temperature'
			},
			{
				key: 'gradual_color_change',
				label: 'Gradient',
				description: 'Transitions between colors'
			},
			{
				key: 'coextruded',
				label: 'Coextruded',
				description: 'Co-extruded from multiple colors'
			},
			{
				key: 'illuminescent_color_change',
				label: 'Glow Color Change',
				description: 'Glow color differs from base'
			}
		]
	},
	imitates: {
		label: 'Imitates',
		traits: [
			{ key: 'imitates_wood', label: 'Wood', description: 'Imitates wood appearance' },
			{ key: 'imitates_metal', label: 'Metal', description: 'Imitates metal appearance' },
			{ key: 'imitates_marble', label: 'Marble', description: 'Imitates marble appearance' },
			{ key: 'imitates_stone', label: 'Stone', description: 'Imitates stone appearance' },
			{ key: 'lithophane', label: 'Lithophane', description: 'Designed for lithophaning' }
		]
	},
	environmental: {
		label: 'Environmental',
		traits: [
			{ key: 'recycled', label: 'Recycled', description: 'Made of recycled materials' },
			{ key: 'recyclable', label: 'Recyclable', description: 'Can be recycled' },
			{ key: 'biodegradable', label: 'Biodegradable', description: 'Will biodegrade' },
			{
				key: 'home_compostable',
				label: 'Home Compostable',
				description: 'Decomposes in home compost'
			},
			{
				key: 'industrially_compostable',
				label: 'Industrial Compostable',
				description: 'Decomposes in commercial facilities'
			},
			{ key: 'bio_based', label: 'Bio-based', description: 'Made from renewable resources' }
		]
	},
	properties: {
		label: 'Properties',
		traits: [
			{ key: 'abrasive', label: 'Abrasive', description: 'Requires abrasive-resistant nozzle' },
			{
				key: 'foaming',
				label: 'Foaming',
				description: 'Increases volume during extrusion'
			},
			{
				key: 'castable',
				label: 'Castable',
				description: 'Suitable for investment casting'
			},
			{
				key: 'self_extinguishing',
				label: 'Self Extinguishing',
				description: 'Self-extinguishing material'
			},
			{
				key: 'high_temperature',
				label: 'High Temp',
				description: 'Softens at higher temperatures'
			},
			{
				key: 'low_outgassing',
				label: 'Low Outgassing',
				description: 'Minimal gas release in vacuum'
			},
			{ key: 'water_soluble', label: 'Water Soluble', description: 'Dissolves in water' },
			{ key: 'ipa_soluble', label: 'IPA Soluble', description: 'Dissolves in IPA' },
			{
				key: 'limonene_soluble',
				label: 'Limonene Soluble',
				description: 'Dissolves in limonene'
			}
		]
	},
	electrical: {
		label: 'Electrical/Magnetic',
		traits: [
			{ key: 'esd_safe', label: 'ESD Safe', description: 'Static dissipative' },
			{ key: 'conductive', label: 'Conductive', description: 'Can conduct electricity' },
			{
				key: 'emi_shielding',
				label: 'EMI Shielding',
				description: 'Shields electromagnetic interference'
			},
			{ key: 'paramagnetic', label: 'Paramagnetic', description: 'Has paramagnetic properties' }
		]
	},
	special: {
		label: 'Special',
		traits: [
			{
				key: 'biocompatible',
				label: 'Biocompatible',
				description: 'Certified biocompatibility'
			},
			{
				key: 'antibacterial',
				label: 'Antibacterial',
				description: 'Has antibacterial properties'
			},
			{
				key: 'air_filtering',
				label: 'Air Filtering',
				description: 'Has air filtering properties'
			},
			{
				key: 'radiation_shielding',
				label: 'Radiation Shield',
				description: 'Has radiation shielding'
			},
			{
				key: 'filtration_recommended',
				label: 'Filtration Req.',
				description: 'HEPA/carbon filter recommended'
			},
			{ key: 'blend', label: 'Blend', description: 'Blend of multiple polymers' },
			{ key: 'limited_edition', label: 'Limited Edition', description: 'Limited edition run' }
		]
	},
	contains: {
		label: 'Contains',
		traits: [
			{ key: 'contains_carbon', label: 'Carbon', description: 'Contains carbon' },
			{
				key: 'contains_carbon_fiber',
				label: 'Carbon Fiber',
				description: 'Contains carbon fibers'
			},
			{
				key: 'contains_carbon_nano_tubes',
				label: 'Carbon Nanotubes',
				description: 'Contains carbon nano tubes'
			},
			{ key: 'contains_glass', label: 'Glass', description: 'Contains glass' },
			{
				key: 'contains_glass_fiber',
				label: 'Glass Fiber',
				description: 'Contains glass fibers'
			},
			{ key: 'contains_kevlar', label: 'Kevlar', description: 'Contains kevlar' },
			{ key: 'contains_ptfe', label: 'PTFE', description: 'Contains PTFE' },
			{ key: 'contains_ceramic', label: 'Ceramic', description: 'Contains ceramic' },
			{
				key: 'contains_boron_carbide',
				label: 'Boron Carbide',
				description: 'Contains boron carbide'
			},
			{ key: 'contains_stone', label: 'Stone', description: 'Contains stone' },
			{ key: 'contains_magnetite', label: 'Magnetite', description: 'Contains magnetite' }
		]
	},
	contains_organic: {
		label: 'Contains Organic',
		traits: [
			{
				key: 'contains_organic_material',
				label: 'Organic Material',
				description: 'Contains organic material'
			},
			{ key: 'contains_wood', label: 'Wood', description: 'Contains wood' },
			{ key: 'contains_cork', label: 'Cork', description: 'Contains cork' },
			{ key: 'contains_wax', label: 'Wax', description: 'Contains wax' },
			{ key: 'contains_algae', label: 'Algae', description: 'Contains algae' },
			{ key: 'contains_bamboo', label: 'Bamboo', description: 'Contains bamboo' },
			{ key: 'contains_pine', label: 'Pine', description: 'Contains pine' }
		]
	},
	contains_metal: {
		label: 'Contains Metal',
		traits: [
			{ key: 'contains_metal', label: 'Metal', description: 'Contains metal' },
			{ key: 'contains_bronze', label: 'Bronze', description: 'Contains bronze' },
			{ key: 'contains_iron', label: 'Iron', description: 'Contains iron' },
			{ key: 'contains_steel', label: 'Steel', description: 'Contains steel' },
			{ key: 'contains_silver', label: 'Silver', description: 'Contains silver' },
			{ key: 'contains_copper', label: 'Copper', description: 'Contains copper' },
			{ key: 'contains_aluminium', label: 'Aluminium', description: 'Contains aluminium' },
			{ key: 'contains_brass', label: 'Brass', description: 'Contains brass' },
			{ key: 'contains_tungsten', label: 'Tungsten', description: 'Contains tungsten' }
		]
	}
};

/**
 * Get all traits as a flat array
 */
export function getAllTraits(): TraitDefinition[] {
	return Object.values(TRAIT_CATEGORIES).flatMap((c) => c.traits);
}

/**
 * Find a trait by its key
 */
export function findTraitByKey(key: string): TraitDefinition | undefined {
	return getAllTraits().find((t) => t.key === key);
}

/**
 * Get the label for a trait key
 */
export function getTraitLabel(key: string): string {
	const trait = findTraitByKey(key);
	return trait?.label || key;
}

/**
 * Get the description for a trait key
 */
export function getTraitDescription(key: string): string {
	const trait = findTraitByKey(key);
	return trait?.description || '';
}
