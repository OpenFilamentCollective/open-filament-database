import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import type { EntityConfig } from './entityConfig';
import { ENTITY_CONFIGS, normalizeBrandId, normalizeMaterialType } from './entityConfig';
import { IS_CLOUD, proxyGetToCloud } from './cloudProxy';

// === Shared utilities ===

async function getAppMode(): Promise<boolean> {
	const { PUBLIC_APP_MODE } = await import('$env/static/public');
	return PUBLIC_APP_MODE !== 'cloud';
}

/**
 * Resolve a cloud proxy path from a config's template and route params.
 * E.g., '/api/brands/:brandId/materials' with { brandId: 'foo' } → '/api/brands/foo/materials'
 */
function resolveCloudPath(
	template: string,
	params: Record<string, string>,
	idParam?: string | null
): string {
	let result = template.replace(/:(\w+)/g, (_, name) => params[name] || name);
	if (idParam && params[idParam]) {
		result += `/${params[idParam]}`;
	}
	return result;
}

function formatJson(data: unknown): string {
	return JSON.stringify(data, null, 4) + '\n';
}

export function generateSlug(name: string, transform: 'lowercase' | 'uppercase'): string {
	if (transform === 'uppercase') {
		return name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
	}
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stripFields(data: Record<string, unknown>, fields: string[]): Record<string, unknown> {
	if (fields.length === 0) return { ...data };
	const result = { ...data };
	for (const field of fields) {
		delete result[field];
	}
	return result;
}

function augmentData(
	data: Record<string, unknown>,
	config: EntityConfig,
	dirName: string,
	params: Record<string, string>
): Record<string, unknown> {
	const result = { ...data };
	for (const [field, source] of Object.entries(config.augmentFields)) {
		result[field] = source === 'dirName' ? dirName : params[source];
	}
	for (const [field, defaultValue] of Object.entries(config.readDefaults)) {
		result[field] = result[field] ?? defaultValue;
	}
	return result;
}

/**
 * Resolve the parent directory for an entity's collection.
 * For root entities (brand, store): returns config.baseDir
 * For nested entities: returns baseDir/param1/param2/...
 */
async function resolveParentDir(
	config: EntityConfig,
	params: Record<string, string>
): Promise<string> {
	let dir = config.baseDir;

	for (const paramName of config.parentParams) {
		let segment = params[paramName];
		if (paramName === 'brandId') {
			segment = await normalizeBrandId(config.baseDir, segment);
		} else if (paramName === 'materialType') {
			segment = await normalizeMaterialType(dir, segment);
		}
		dir = path.join(dir, segment);
	}

	return dir;
}

/**
 * Resolve the full directory path for a specific entity.
 */
async function resolveEntityDir(
	config: EntityConfig,
	params: Record<string, string>
): Promise<string> {
	const parentDir = await resolveParentDir(config, params);
	const idParam = config.idParam!;
	let entityId = params[idParam];

	if (config.normalizeId) {
		entityId = await config.normalizeId(parentDir, entityId);
	}

	return path.join(parentDir, entityId);
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Read supplementary JSON files and merge them into entity data.
 */
async function mergeSupplementaryFiles(
	data: Record<string, unknown>,
	entityDir: string,
	config: EntityConfig
): Promise<Record<string, unknown>> {
	if (!config.supplementaryFiles) return data;

	const result = { ...data };
	for (const [field, filename] of Object.entries(config.supplementaryFiles)) {
		try {
			const content = await fs.readFile(path.join(entityDir, filename), 'utf-8');
			result[field] = JSON.parse(content);
		} catch {
			// File doesn't exist or is invalid — skip silently
		}
	}
	return result;
}

// === Handler factories ===

/**
 * GET handler for listing entities (collection endpoint).
 * In cloud mode, proxies to the cloud API instead of reading from the local filesystem.
 */
export function createListHandler(config: EntityConfig) {
	return async ({ params }: { params: Record<string, string> }) => {
		if (IS_CLOUD) {
			return proxyGetToCloud(resolveCloudPath(config.cloudPathTemplate, params));
		}

		try {
			const parentDir = await resolveParentDir(config, params);
			const entries = await fs.readdir(parentDir, { withFileTypes: true });

			const items = await Promise.all(
				entries
					.filter((entry) => entry.isDirectory())
					.map(async (entry) => {
						const entityDir = path.join(parentDir, entry.name);
						const filePath = path.join(entityDir, config.jsonFilename);
						try {
							const content = await fs.readFile(filePath, 'utf-8');
							let data = JSON.parse(content);
							data = await mergeSupplementaryFiles(data, entityDir, config);
							return augmentData(data, config, entry.name, params);
						} catch {
							return null;
						}
					})
			);

			return json(items.filter((item) => item !== null));
		} catch (error) {
			console.error(`Error listing ${config.entityType}s:`, error);
			return json([], { status: 500 });
		}
	};
}

/**
 * GET handler for a single entity (detail endpoint).
 * In cloud mode, proxies to the cloud API instead of reading from the local filesystem.
 */
export function createGetHandler(config: EntityConfig) {
	return async ({ params }: { params: Record<string, string> }) => {
		if (IS_CLOUD) {
			return proxyGetToCloud(resolveCloudPath(config.cloudPathTemplate, params, config.idParam));
		}

		try {
			const entityDir = await resolveEntityDir(config, params);
			const filePath = path.join(entityDir, config.jsonFilename);
			const content = await fs.readFile(filePath, 'utf-8');
			let data = JSON.parse(content);
			data = await mergeSupplementaryFiles(data, entityDir, config);
			const dirName = path.basename(entityDir);
			return json(augmentData(data, config, dirName, params));
		} catch (error) {
			console.error(`Error reading ${config.entityType} ${params[config.idParam!]}:`, error);
			return json({ error: `${capitalize(config.entityType)} not found` }, { status: 404 });
		}
	};
}

/**
 * POST handler for creating a new entity.
 */
export function createPostHandler(config: EntityConfig) {
	return async ({ params, request }: { params: Record<string, string>; request: Request }) => {
		try {
			const isLocal = await getAppMode();
			const requestData = await request.json();

			// Generate slug: check override field, then slug/id, then generate from source field
			const slug = (config.slugOverrideField && requestData[config.slugOverrideField])
				|| requestData.slug
				|| requestData.id
				|| generateSlug(requestData[config.slugSourceField], config.slugTransform!);

			if (isLocal) {
				const parentDir = await resolveParentDir(config, params);
				const entityDir = path.join(parentDir, slug);

				await fs.mkdir(entityDir, { recursive: true });

				const storageData = stripFields(requestData, config.stripFields);
				if (config.writeSlugToFile !== false) {
					storageData.id = slug;
					storageData.slug = slug;
				}

				// Set extra fields from route params
				for (const [field, paramName] of Object.entries(config.createExtraFields)) {
					storageData[field] = params[paramName];
				}

				await fs.writeFile(
					path.join(entityDir, config.jsonFilename),
					formatJson(storageData),
					'utf-8'
				);

				return json({
					success: true,
					[config.entityType]: augmentData(storageData, config, slug, params)
				}, { status: 201 });
			} else {
				return json({
					success: true,
					mode: 'cloud',
					[config.entityType]: { ...requestData, id: slug, slug }
				}, { status: 201 });
			}
		} catch (error) {
			console.error(`Error creating ${config.entityType}:`, error);
			return json({ error: `Failed to create ${config.entityType}` }, { status: 500 });
		}
	};
}

/**
 * PUT handler for updating an entity.
 */
export function createPutHandler(config: EntityConfig) {
	return async ({ params, request }: { params: Record<string, string>; request: Request }) => {
		try {
			const isLocal = await getAppMode();
			const data = await request.json();

			if (config.validatePut) {
				const validationError = config.validatePut(params, data);
				if (validationError) {
					return json({ error: validationError.error }, { status: validationError.status });
				}
			}

			if (isLocal) {
				const entityDir = await resolveEntityDir(config, params);
				const filePath = path.join(entityDir, config.jsonFilename);
				const cleanData = stripFields(data, config.stripFields);
				await fs.writeFile(filePath, formatJson(cleanData), 'utf-8');
				return json({ success: true });
			} else {
				return json({ success: true, mode: 'cloud' });
			}
		} catch (error) {
			console.error(`Error saving ${config.entityType} ${params[config.idParam!]}:`, error);
			return json({ error: `Failed to save ${config.entityType}` }, { status: 500 });
		}
	};
}

/**
 * DELETE handler for removing an entity.
 */
export function createDeleteHandler(config: EntityConfig) {
	return async ({ params }: { params: Record<string, string> }) => {
		try {
			const isLocal = await getAppMode();

			if (!isLocal) {
				return json({ success: true, mode: 'cloud' });
			}

			const entityDir = await resolveEntityDir(config, params);
			await fs.rm(entityDir, { recursive: true, force: true });
			return json({ success: true });
		} catch (error) {
			console.error(`Error deleting ${config.entityType} ${params[config.idParam!]}:`, error);
			return json({ error: `Failed to delete ${config.entityType}` }, { status: 500 });
		}
	};
}
