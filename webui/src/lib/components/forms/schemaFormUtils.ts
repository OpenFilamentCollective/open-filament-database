/**
 * Utility functions for the SchemaForm component
 */

import type { SchemaFormConfig, ProcessedField, RenderItem, FieldType } from './schemaFormTypes';

/**
 * Check if a property has an external $ref (pointing to another schema file)
 */
export function hasExternalRef(propSchema: any, definitions?: Record<string, any>): boolean {
	// Direct external ref on the property
	if (propSchema?.$ref && propSchema.$ref.startsWith('./')) {
		return true;
	}

	// Check if it references a definition that has an external ref
	if (propSchema?.$ref?.startsWith('#/definitions/') && definitions) {
		const defName = propSchema.$ref.replace('#/definitions/', '');
		const definition = definitions[defName];
		if (definition?.$ref && definition.$ref.startsWith('./')) {
			return true;
		}
	}

	return false;
}

/**
 * Determine the field type based on schema properties and config overrides
 */
export function getFieldType(
	key: string,
	propSchema: any,
	config: SchemaFormConfig,
	definitions?: Record<string, any>
): FieldType {
	// Check for explicit type override
	if (config.typeOverrides?.[key]) {
		return config.typeOverrides[key];
	}

	// Check for hidden fields
	if (config.hiddenFields?.includes(key)) {
		return 'hidden';
	}

	// Detect color hex fields by key pattern
	if (key.includes('color') && key.includes('hex')) {
		return 'color';
	}

	// Boolean -> Checkbox
	if (propSchema.type === 'boolean') {
		return 'checkbox';
	}

	// String with enum -> Select
	if (propSchema.type === 'string' && propSchema.enum) {
		return 'select';
	}

	// Check if this field has a dynamic enum source from config
	if (config.enumSources?.[key]) {
		return 'select';
	}

	// Check if this field has an external $ref (enum from another schema file)
	if (hasExternalRef(propSchema, definitions)) {
		return 'select';
	}

	// Array of strings -> Tags
	if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
		return 'tags';
	}

	// Number/Integer -> Number field
	if (propSchema.type === 'number' || propSchema.type === 'integer') {
		return 'number';
	}

	// Complex objects -> custom handling
	if (propSchema.type === 'object') {
		return 'custom';
	}

	// Default to text for strings and unknown types
	return 'text';
}

/**
 * Process schema into a list of renderable fields
 */
export function processFields(schema: any, config: SchemaFormConfig): ProcessedField[] {
	const properties = schema?.properties || {};
	const definitions = schema?.definitions;
	const required = new Set(schema?.required || []);

	// Determine field order
	let fieldKeys: string[];
	if (config.fieldOrder && config.fieldOrder.length > 0) {
		// Use custom order, but only include fields that exist in schema
		fieldKeys = config.fieldOrder.filter((k) => k in properties);
		// Add any schema fields not in fieldOrder at the end
		const orderedSet = new Set(fieldKeys);
		for (const key of Object.keys(properties)) {
			if (!orderedSet.has(key)) {
				fieldKeys.push(key);
			}
		}
	} else {
		fieldKeys = Object.keys(properties);
	}

	// Create a map of field -> group index for quick lookup
	const fieldToGroupIndex = new Map<string, number>();
	if (config.fieldGroups) {
		config.fieldGroups.forEach((group, index) => {
			group.forEach((fieldKey) => {
				fieldToGroupIndex.set(fieldKey, index);
			});
		});
	}

	// Map to processed fields, filtering out hidden fields
	return fieldKeys
		.filter((key) => !config.hiddenFields?.includes(key))
		.map((key) => {
			const groupIndex = fieldToGroupIndex.get(key);
			const fieldType = getFieldType(key, properties[key], config, definitions);

			return {
				key,
				type: fieldType,
				schema: properties[key],
				isRequired: required.has(key),
				isGrouped: groupIndex !== undefined,
				groupIndex
			};
		})
		.filter((field) => field.type !== 'hidden');
}

/**
 * Group fields for rendering, combining grouped fields into FormFieldRow
 */
export function groupFieldsForRender(fields: ProcessedField[]): RenderItem[] {
	const result: RenderItem[] = [];
	const processedGroups = new Set<number>();

	for (const field of fields) {
		if (field.isGrouped && field.groupIndex !== undefined) {
			// Skip if we've already processed this group
			if (processedGroups.has(field.groupIndex)) {
				continue;
			}

			// Get all fields in this group
			const groupFields = fields.filter(
				(f) => f.isGrouped && f.groupIndex === field.groupIndex
			);

			result.push({
				isGroup: true,
				fields: groupFields
			});

			processedGroups.add(field.groupIndex);
		} else {
			result.push({
				isGroup: false,
				field
			});
		}
	}

	return result;
}

/**
 * Split fields into left and right sections based on splitAfterKey
 */
export function splitFields(
	fields: ProcessedField[],
	splitAfterKey?: string
): { leftFields: ProcessedField[]; rightFields: ProcessedField[] } {
	if (!splitAfterKey) {
		return { leftFields: fields, rightFields: [] };
	}

	const splitIndex = fields.findIndex((f) => f.key === splitAfterKey);
	if (splitIndex === -1) {
		return { leftFields: fields, rightFields: [] };
	}

	return {
		leftFields: fields.slice(0, splitIndex + 1),
		rightFields: fields.slice(splitIndex + 1)
	};
}

/**
 * Fetch enum values from an API endpoint
 */
export async function fetchEnumValues(
	url: string,
	path: string = 'enum'
): Promise<string[]> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			console.error(`Failed to fetch enum from ${url}: ${response.statusText}`);
			return [];
		}

		const data = await response.json();

		// Navigate to the specified path
		const parts = path.split('.');
		let result = data;
		for (const part of parts) {
			if (result && typeof result === 'object' && part in result) {
				result = result[part];
			} else {
				console.error(`Path "${path}" not found in response from ${url}`);
				return [];
			}
		}

		if (Array.isArray(result)) {
			return result;
		}

		console.error(`Value at path "${path}" is not an array`);
		return [];
	} catch (error) {
		console.error(`Error fetching enum from ${url}:`, error);
		return [];
	}
}

/**
 * Convert snake_case to Title Case
 */
export function formatLabel(fieldName: string): string {
	return fieldName
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * Get the label for a field, preferring schema title over formatted key
 */
export function getFieldLabel(key: string, schema: any, configLabel?: string): string {
	if (configLabel) return configLabel;
	if (schema?.title) return schema.title;
	return formatLabel(key);
}

/**
 * Get the placeholder for a field from schema or config
 */
export function getFieldPlaceholder(schema: any, configPlaceholder?: string): string {
	if (configPlaceholder) return configPlaceholder;
	if (schema?.['x-placeholder']) return schema['x-placeholder'];
	return '';
}

/**
 * Get the default value for a field based on its schema type
 */
export function getDefaultValue(propSchema: any): any {
	if (propSchema.default !== undefined) {
		return propSchema.default;
	}

	switch (propSchema.type) {
		case 'string':
			return '';
		case 'number':
		case 'integer':
			return undefined;
		case 'boolean':
			return false;
		case 'array':
			return [];
		case 'object':
			return {};
		default:
			return undefined;
	}
}

/**
 * Initialize form data from schema and existing entity
 * Extracts values from entity based on schema properties, using defaults for missing values
 */
export function initializeFormData(
	schema: any,
	entity?: any,
	hiddenFields?: string[]
): Record<string, any> {
	const properties = schema?.properties || {};
	const data: Record<string, any> = {};

	for (const [key, propSchema] of Object.entries(properties) as [string, any][]) {
		// Skip hidden fields
		if (hiddenFields?.includes(key)) continue;

		// Use entity value if available, otherwise use default
		if (entity && entity[key] !== undefined) {
			data[key] = entity[key];
		} else {
			data[key] = getDefaultValue(propSchema);
		}
	}

	return data;
}

/**
 * Build submit data by filtering out empty optional fields
 * Required fields are always included; optional fields are only included if they have values
 */
export function buildSubmitData(
	schema: any,
	formData: Record<string, any>,
	hiddenFields?: string[]
): Record<string, any> {
	const properties = schema?.properties || {};
	const required = new Set(schema?.required || []);
	const submitData: Record<string, any> = {};

	for (const [key, value] of Object.entries(formData)) {
		// Skip hidden fields - they're handled separately
		if (hiddenFields?.includes(key)) continue;

		// Skip if property not in schema
		if (!(key in properties)) continue;

		const isRequired = required.has(key);
		const propSchema = properties[key];

		// Always include required fields
		if (isRequired) {
			submitData[key] = value;
			continue;
		}

		// For optional fields, only include if they have meaningful values
		if (hasValue(value, propSchema)) {
			submitData[key] = value;
		}
	}

	return submitData;
}

/**
 * Check if a value is "meaningful" (not empty/undefined)
 */
function hasValue(value: any, propSchema: any): boolean {
	if (value === undefined || value === null) return false;
	if (value === '') return false;
	if (Array.isArray(value) && value.length === 0) return false;
	if (propSchema?.type === 'object' && typeof value === 'object' && Object.keys(value).length === 0) return false;
	return true;
}
