/**
 * Type definitions for the SchemaForm component
 */

export type FieldType = 'text' | 'url' | 'number' | 'select' | 'checkbox' | 'tags' | 'color' | 'custom' | 'hidden';

export interface EnumSource {
	url: string;
	path?: string; // JSON path to enum array (default: 'enum')
}

/**
 * Transform function that takes a value and returns the transformed value
 * Can also return a validation error string (starts with "Error:") to reject the value
 */
export type FieldTransform = (value: any) => any;

export interface SchemaFormConfig {
	// Layout configuration
	splitAfterKey?: string; // Field key after which to create TwoColumnLayout
	leftWidth?: '1/2' | '2/3'; // Width ratio for TwoColumnLayout (default: '1/2')
	leftSpacing?: 'sm' | 'md'; // Vertical spacing in left column (default: 'md')

	// Field grouping (horizontal rows via FormFieldRow)
	fieldGroups?: string[][]; // Groups of field keys to render together
	// e.g., [['min_print_temp', 'max_print_temp'], ['density', 'diameter']]

	// Field control
	hiddenFields?: string[]; // Fields to exclude from auto-generation
	fieldOrder?: string[]; // Custom field order (if not specified, uses schema order)

	// Field metadata overrides
	tooltips?: Record<string, string>; // Tooltip text by field key
	placeholders?: Record<string, string>; // Placeholder text by field key
	labels?: Record<string, string>; // Custom labels (overrides formatLabel)
	steps?: Record<string, number>; // Step values for number inputs

	// Dynamic enums from API
	enumSources?: Record<string, EnumSource>;

	// Component type overrides for specific fields
	typeOverrides?: Record<string, FieldType>;

	// Field name mappings for data transformation
	// Maps schema field names to different names for initialization/submission
	// e.g., { 'name': 'color_name' } means:
	//   - When initializing, read from entity.color_name into formData.name
	//   - When submitting, write formData.name to submitData.color_name
	fieldMappings?: Record<string, string>;

	// Value transforms applied during submission
	// Maps field keys to transform functions that modify values before submission
	// e.g., { 'origin': transforms.uppercase }
	transforms?: Record<string, FieldTransform>;
}

// Entity types that can be auto-loaded by SchemaForm
export type EntityType = 'brand' | 'store' | 'material' | 'filament' | 'variant';

export interface ProcessedField {
	key: string;
	type: FieldType;
	schema: any;
	isRequired: boolean;
	isGrouped: boolean;
	groupIndex?: number;
}

export interface GroupedItem {
	isGroup: true;
	fields: ProcessedField[];
}

export interface SingleItem {
	isGroup: false;
	field: ProcessedField;
}

export type RenderItem = GroupedItem | SingleItem;
