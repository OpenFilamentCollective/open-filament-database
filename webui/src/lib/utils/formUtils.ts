/**
 * Utility functions for form submission handling
 */

/**
 * Build submit data by filtering out empty/undefined optional fields
 * Reduces repetitive if statements in form submission handlers
 */
export function buildOptionalFields<T extends Record<string, any>>(
	source: T,
	optionalFields: (keyof T)[]
): Partial<T> {
	const result: Partial<T> = {};

	for (const field of optionalFields) {
		const value = source[field];
		if (value !== undefined && value !== null && value !== '') {
			// Handle arrays - only include if not empty
			if (Array.isArray(value) && value.length === 0) {
				continue;
			}
			result[field] = value;
		}
	}

	return result;
}

/**
 * Merge required and optional fields for form submission
 */
export function buildSubmitData<T extends Record<string, any>>(
	source: T,
	requiredFields: (keyof T)[],
	optionalFields: (keyof T)[]
): Partial<T> {
	const result: Partial<T> = {};

	// Always include required fields
	for (const field of requiredFields) {
		result[field] = source[field];
	}

	// Add optional fields that have values
	const optionals = buildOptionalFields(source, optionalFields);
	return { ...result, ...optionals };
}
