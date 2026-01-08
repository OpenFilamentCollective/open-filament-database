/**
 * Format a field name to a human-readable label
 * Converts snake_case to Title Case
 * e.g., "ships_from" -> "Ships From"
 */
export function formatLabel(fieldName: string): string {
	return fieldName
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * Apply formatted titles to all properties in a schema
 * Only applies if a title doesn't already exist
 */
export function applyFormattedTitles(schema: any): any {
	const schemaCopy = JSON.parse(JSON.stringify(schema));

	if (schemaCopy.properties) {
		for (const key in schemaCopy.properties) {
			const prop = schemaCopy.properties[key];

			// Only apply formatted title if no title exists
			if (!prop.title) {
				prop.title = formatLabel(key);
			}

			// Recursively apply to nested object properties
			if (prop.type === 'object' && prop.properties) {
				prop.properties = applyFormattedTitles({ properties: prop.properties }).properties;
			}

			// Recursively apply to array items
			if (prop.type === 'array' && prop.items && prop.items.properties) {
				prop.items = applyFormattedTitles(prop.items);
			}
		}
	}

	return schemaCopy;
}

/**
 * Remove the ID field from a JSON schema for editing
 * The ID field should not be editable as it's part of the file path
 */
export function removeIdFromSchema(schema: any): any {
	const schemaCopy = JSON.parse(JSON.stringify(schema));

	if (schemaCopy.properties && schemaCopy.properties.id) {
		delete schemaCopy.properties.id;
	}

	if (schemaCopy.required && Array.isArray(schemaCopy.required)) {
		schemaCopy.required = schemaCopy.required.filter((field: string) => field !== 'id');
	}

	return schemaCopy;
}

/**
 * Create UI schema configuration with Tailwind classes for SJSF components
 * Optionally hide array item labels (like "ships_from-1")
 */
export function createUiSchema(hideArrayItemLabels = true) {
	const baseUiSchema: any = {
		'ui:options': {
			// Submit button - Green (uses submitButton option, not button/buttons)
			submitButton: {
				class:
					'sjsf-submit-button w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all disabled:opacity-50'
			},
			// Base button styling - applies to all other buttons
			button: {
				class:
					'sjsf-button px-4 py-2 rounded-lg font-medium transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed'
			},
			// Specific button type styling
			buttons: {
				// Add item/property buttons - Blue
				'array-item-add': {
					class: 'sjsf-button w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
				},
				'object-property-add': {
					class: 'sjsf-button w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
				},
				// Remove buttons - Red
				'array-item-remove': {
					class: 'sjsf-button px-2 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 min-w-10'
				},
				'object-property-remove': {
					class: 'sjsf-button px-2 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 min-w-10'
				},
				// Move buttons - Gray
				'array-item-move-up': {
					class: 'sjsf-button px-2 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 min-w-10'
				},
				'array-item-move-down': {
					class: 'sjsf-button px-2 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 min-w-10'
				},
				// Copy button - Purple
				'array-item-copy': {
					class: 'sjsf-button px-2 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 min-w-10'
				}
			}
		}
	};

	// Add CSS to hide array item labels if requested
	if (hideArrayItemLabels) {
		// We'll add a custom CSS class to hide the labels
		// This will be applied via the styles file
	}

	return baseUiSchema;
}

/**
 * Normalize schema to handle union types that the form library doesn't support well
 * Specifically, converts type: ["array", "string"] to type: "array"
 */
export function normalizeSchema(schema: any): any {
	const normalized = JSON.parse(JSON.stringify(schema));

	// Recursively process properties
	if (normalized.properties) {
		for (const key in normalized.properties) {
			const prop = normalized.properties[key];

			// Handle union types like ["array", "string"]
			if (Array.isArray(prop.type) && prop.type.includes('array')) {
				// Prefer array type for form editing
				prop.type = 'array';
			}
		}
	}

	return normalized;
}

/**
 * Normalize data to match array-only schema
 * Converts string values to single-element arrays where needed
 */
export function normalizeDataForForm(data: any, schema: any): any {
	const normalized = { ...data };

	if (schema.properties) {
		for (const key in schema.properties) {
			const prop = schema.properties[key];

			// If property should be an array but is a string, convert it
			if (prop.type === 'array' && typeof normalized[key] === 'string') {
				normalized[key] = [normalized[key]];
			}
			// If property should be an array but is undefined/null, use empty array
			else if (prop.type === 'array' && !normalized[key]) {
				normalized[key] = [];
			}
		}
	}

	return normalized;
}

/**
 * Process schema for editing: normalize types, format titles, and remove ID field
 */
export function prepareSchemaForEdit(schema: any) {
	let schemaCopy = normalizeSchema(schema);
	schemaCopy = removeIdFromSchema(schemaCopy);
	schemaCopy = applyFormattedTitles(schemaCopy);

	return {
		schema: schemaCopy,
		uiSchema: createUiSchema()
	};
}
