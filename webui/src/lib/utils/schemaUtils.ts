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
 */
export function createUiSchema() {
	return {
		'ui:options': {
			// Submit button - Primary
			submitButton: {
				class:
					'sjsf-submit-button w-full px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 font-medium'
			},
			// Base button styling - applies to all other buttons
			button: {
				class:
					'sjsf-button px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
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
 * Resolve external schema references by inlining them.
 * Converts references like "./material_types_schema.json" to inline definitions
 * using a pre-fetched map of external schemas.
 */
export function resolveExternalReferences(schema: any, externalSchemas: Record<string, any> = {}): any {
	const schemaCopy = JSON.parse(JSON.stringify(schema));

	function processObject(obj: any): any {
		if (!obj || typeof obj !== 'object') {
			return obj;
		}

		// Check if this object has a $ref to an external file
		if (obj.$ref && typeof obj.$ref === 'string' && obj.$ref.startsWith('./')) {
			const resolved = externalSchemas[obj.$ref];
			if (resolved) {
				// Inline the resolved schema, stripping meta fields
				const { $id, $schema, ...content } = resolved;
				return content;
			}
			// If we don't have a resolved version, keep as-is
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
 * Fetch all external schemas referenced by `$ref` in the given schema,
 * then resolve them inline. External schemas are fetched from /api/schemas/.
 */
export async function fetchAndResolveExternalReferences(schema: any): Promise<any> {
	const refs = collectExternalRefs(schema);
	if (refs.length === 0) return JSON.parse(JSON.stringify(schema));

	const externalSchemas: Record<string, any> = {};
	await Promise.all(
		refs.map(async (ref) => {
			// Convert ./filename_schema.json to /api/schemas/filename
			const route = ref.replace('./', '').replace(/_schema\.json$/, '');
			try {
				const response = await fetch(`/api/schemas/${route}`);
				if (response.ok) {
					externalSchemas[ref] = await response.json();
				}
			} catch {
				// leave unresolved — the form's dynamic enum loader will handle it
			}
		})
	);

	return resolveExternalReferences(schema, externalSchemas);
}

/** Collect all unique external `$ref` values (starting with `./`) from a schema. */
function collectExternalRefs(obj: any, refs = new Set<string>()): string[] {
	if (!obj || typeof obj !== 'object') return [...refs];
	if (obj.$ref && typeof obj.$ref === 'string' && obj.$ref.startsWith('./')) {
		refs.add(obj.$ref);
	}
	for (const value of Object.values(obj)) {
		collectExternalRefs(value, refs);
	}
	return [...refs];
}

/**
 * Process schema for editing: normalize types, format titles, and remove ID field
 */
export async function prepareSchemaForEdit(schema: any) {
	let schemaCopy = await fetchAndResolveExternalReferences(schema);
	schemaCopy = normalizeSchema(schemaCopy);
	schemaCopy = removeIdFromSchema(schemaCopy);
	schemaCopy = applyFormattedTitles(schemaCopy);

	return {
		schema: schemaCopy,
		uiSchema: createUiSchema()
	};
}
