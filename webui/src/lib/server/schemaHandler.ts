import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import { SCHEMA_DIR } from './entityConfig';

/**
 * Create a GET handler that reads a schema JSON file from disk.
 * @param schemaName - e.g., 'brand', 'material', 'filament', 'store', 'variant'
 */
export function createSchemaHandler(schemaName: string) {
	return async () => {
		try {
			const schemaPath = `${SCHEMA_DIR}/${schemaName}_schema.json`;
			const content = await fs.readFile(schemaPath, 'utf-8');
			return json(JSON.parse(content));
		} catch (error) {
			console.error(`Error reading ${schemaName} schema:`, error);
			return json({ error: 'Schema not found' }, { status: 404 });
		}
	};
}
