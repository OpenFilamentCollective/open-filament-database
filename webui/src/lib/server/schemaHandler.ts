import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import { SCHEMA_DIR } from './entityConfig';
import { IS_CLOUD, proxyGetToCloud } from './cloudProxy';

/**
 * Create a GET handler that serves a schema.
 * In cloud mode, proxies to the cloud API. In local mode, reads from disk.
 * @param schemaName - e.g., 'brand', 'material', 'filament', 'store', 'variant'
 */
export function createSchemaHandler(schemaName: string) {
	const readLocal = async () => {
		const schemaPath = `${SCHEMA_DIR}/${schemaName}_schema.json`;
		return JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
	};

	return async () => {
		if (IS_CLOUD) {
			const response = await proxyGetToCloud(`/api/schemas/${schemaName}`);
			if (response.status !== 404) return response;
			// A schema newer than the deployed API: serve the repo's copy when this
			// server runs from a checkout (the Docker image has none, so it stays 404).
			try {
				return json(await readLocal());
			} catch {
				return response;
			}
		}

		try {
			return json(await readLocal());
		} catch (error) {
			console.error(`Error reading ${schemaName} schema:`, error);
			return json({ error: 'Schema not found' }, { status: 404 });
		}
	};
}
