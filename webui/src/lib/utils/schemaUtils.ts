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
			// Submit button - Success
			submitButton: {
				class:
					'sjsf-submit-button w-full px-6 py-3 bg-success text-success-foreground rounded-md hover:bg-success/90 transition-all disabled:opacity-50 font-medium'
			},
			// Base button styling - applies to all other buttons
			button: {
				class:
					'sjsf-button px-4 py-2 rounded-md font-medium transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed'
			},
			// Specific button type styling
			buttons: {
				// Add item/property buttons - Secondary
				'array-item-add': {
					class:
						'sjsf-button w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80'
				},
				'object-property-add': {
					class:
						'sjsf-button w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80'
				},
				// Remove buttons - Destructive
				'array-item-remove': {
					class:
						'sjsf-button px-2 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 min-w-10'
				},
				'object-property-remove': {
					class:
						'sjsf-button px-2 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 min-w-10'
				},
				// Move buttons - Muted
				'array-item-move-up': {
					class:
						'sjsf-button px-2 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 min-w-10'
				},
				'array-item-move-down': {
					class:
						'sjsf-button px-2 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 min-w-10'
				},
				// Copy button - Accent
				'array-item-copy': {
					class:
						'sjsf-button px-2 py-2 bg-accent text-accent-foreground rounded-md hover:bg-accent/80 min-w-10'
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
 * Resolve external schema references by inlining them
 * Converts references like "./material_types_schema.json" to inline definitions
 */
export function resolveExternalReferences(schema: any): any {
	const schemaCopy = JSON.parse(JSON.stringify(schema));

	// Helper function to recursively process schema objects
	function processObject(obj: any): any {
		if (!obj || typeof obj !== 'object') {
			return obj;
		}

		// Check if this object has a $ref to an external file
		if (obj.$ref && typeof obj.$ref === 'string' && obj.$ref.startsWith('./')) {
			// For material_types_schema.json, inline the enum directly
			if (obj.$ref === './material_types_schema.json') {
				return {
					type: 'string',
					enum: [
						'PLA',
						'PETG',
						'TPU',
						'ABS',
						'ASA',
						'PC',
						'PCTG',
						'PP',
						'PA6',
						'PA11',
						'PA12',
						'PA66',
						'CPE',
						'TPE',
						'HIPS',
						'PHA',
						'PET',
						'PEI',
						'PBT',
						'PVB',
						'PVA',
						'PEKK',
						'PEEK',
						'BVOH',
						'TPC',
						'PPS',
						'PPSU',
						'PVC',
						'PEBA',
						'PVDF',
						'PPA',
						'PCL',
						'PES',
						'PMMA',
						'POM',
						'PPE',
						'PS',
						'PSU',
						'TPI',
						'SBS',
						'OBC',
						'EVA'
					]
				};
			}
			// If we encounter other external references, keep them as-is
			return obj;
		}

		// Recursively process all properties
		for (const key in obj) {
			if (obj.hasOwnProperty(key)) {
				obj[key] = processObject(obj[key]);
			}
		}

		return obj;
	}

	return processObject(schemaCopy);
}

/**
 * Process schema for editing: normalize types, format titles, and remove ID field
 */
export function prepareSchemaForEdit(schema: any) {
	let schemaCopy = resolveExternalReferences(schema);
	schemaCopy = normalizeSchema(schemaCopy);
	schemaCopy = removeIdFromSchema(schemaCopy);
	schemaCopy = applyFormattedTitles(schemaCopy);

	return {
		schema: schemaCopy,
		uiSchema: createUiSchema()
	};
}
