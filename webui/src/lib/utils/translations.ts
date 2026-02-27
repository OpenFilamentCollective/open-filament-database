import { translation as englishTranslation } from '@sjsf/form/translations/en';
import { overrideByRecord } from '@sjsf/form/lib/resolver';

/**
 * Custom SJSF translation definitions with icon-only button labels
 * Uses Unicode symbols for better visual UX
 */
const customDefinitions = {
	// Use icons instead of text for array/object manipulation buttons
	'move-array-item-up': '↑',
	'move-array-item-down': '↓',
	'remove-array-item': '×',
	'remove-object-property': '×',
	'copy-array-item': '⎘',
	'add-array-item': '+ Add Item',
	'add-object-property': '+ Add Property'
};

/**
 * Custom SJSF translation function
 * Overrides default English translations with our icon-based labels
 */
export const customTranslation = overrideByRecord(englishTranslation, customDefinitions);
