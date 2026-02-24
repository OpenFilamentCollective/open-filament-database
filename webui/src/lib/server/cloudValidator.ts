/**
 * Cloud-mode validation using ajv for JSON schema validation.
 * No subprocess spawning — all validation runs in-process.
 */
import Ajv, { type ErrorObject } from 'ajv';
import { API_BASE } from './cloudProxy';
import { SAFE_SEGMENT, cleanEntityData } from './saveUtils';
import type { Job } from './jobManager';
import { validateLogoDimensions } from './imageValidation';

// --- Types ---

interface ValidationError {
	category: string;
	level: 'ERROR' | 'WARNING';
	message: string;
	path?: string;
}

interface ValidationResult {
	is_valid: boolean;
	error_count: number;
	warning_count: number;
	errors: ValidationError[];
}

// --- Schema cache ---

const SCHEMA_NAMES = ['brand', 'material', 'filament', 'variant', 'store', 'sizes', 'material_types'] as const;
type SchemaName = (typeof SCHEMA_NAMES)[number];

const ALLOWED_ENTITY_TYPES = new Set(['brand', 'material', 'filament', 'variant', 'store']);
const ALLOWED_OPERATIONS = new Set(['create', 'update', 'delete']);
const MAX_CHANGES = 500;

interface CachedSchema {
	schema: object;
	fetchedAt: number;
}

const schemaCache = new Map<SchemaName, CachedSchema>();
const SCHEMA_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function fetchSchema(name: SchemaName): Promise<object> {
	const cached = schemaCache.get(name);
	if (cached && Date.now() - cached.fetchedAt < SCHEMA_TTL_MS) {
		return cached.schema;
	}

	const url = `${API_BASE}/api/v1/schemas/${name}_schema.json`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch schema '${name}': HTTP ${response.status}`);
	}
	const schema = await response.json();

	if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
		throw new Error(`Invalid schema response for '${name}'`);
	}

	schemaCache.set(name, { schema, fetchedAt: Date.now() });
	return schema;
}

async function prefetchSchemas(): Promise<void> {
	await Promise.all(SCHEMA_NAMES.map((name) => fetchSchema(name)));
}

// --- Store ID cache (for cross-reference validation) ---

let storeIdsCache: { ids: Set<string>; fetchedAt: number } | null = null;
const STORE_IDS_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function fetchKnownStoreIds(): Promise<Set<string>> {
	if (storeIdsCache && Date.now() - storeIdsCache.fetchedAt < STORE_IDS_TTL_MS) {
		return storeIdsCache.ids;
	}

	const url = `${API_BASE}/api/v1/stores/index.json`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch stores: HTTP ${response.status}`);
	}
	const data = await response.json();

	const ids = new Set<string>();
	const stores = Array.isArray(data) ? data : data?.stores;
	if (Array.isArray(stores)) {
		for (const store of stores) {
			if (store && typeof store.id === 'string') {
				ids.add(store.id);
			}
		}
	}

	storeIdsCache = { ids, fetchedAt: Date.now() };
	return ids;
}

// --- Ajv setup ---

function createAjvInstance(): Ajv {
	return new Ajv({
		allErrors: true,
		strict: false,
		allowUnionTypes: true,
		validateSchema: false
	});
}

async function compileValidator(entityType: SchemaName) {
	const ajv = createAjvInstance();

	// Register material_types schema so $ref resolves for material_schema
	const materialTypesSchema = await fetchSchema('material_types');
	ajv.addSchema(materialTypesSchema, './material_types_schema.json');

	const schema = await fetchSchema(entityType);
	return ajv.compile(schema);
}

// --- Sanitization ---

/** Strip prototype pollution keys from an object (defense-in-depth). */
function sanitizeObject(data: unknown): Record<string, unknown> | null {
	if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;

	const clean: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
		if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
		clean[key] = value;
	}
	return clean;
}

// --- Path validation ---

/** Map from entity type to the index of the id segment within the entity path. */
const ENTITY_ID_SEGMENT_INDEX: Record<string, number> = {
	store: 1, // stores/{storeId}
	brand: 1, // brands/{brandId}
	material: 3, // brands/{brandId}/materials/{materialId}
	filament: 5, // brands/{brandId}/materials/{materialType}/filaments/{filamentId}
	variant: 7 // brands/{brandId}/materials/{materialType}/filaments/{filamentId}/variants/{variantSlug}
};

/**
 * Validate that the entity's id in its data matches the corresponding path segment.
 * This is the cloud-mode equivalent of the Rust "folder naming conventions" check.
 */
function validateFolderNaming(
	entityPath: string,
	entityType: string,
	data: Record<string, unknown>
): ValidationError | null {
	const segmentIdx = ENTITY_ID_SEGMENT_INDEX[entityType];
	if (segmentIdx === undefined) return null;

	const parts = entityPath.split('/');
	const pathSegment = parts[segmentIdx];
	if (!pathSegment) return null;

	const dataId = typeof data.id === 'string' ? data.id : undefined;
	if (!dataId) return null; // Missing id will be caught by schema validation

	if (dataId !== pathSegment) {
		return {
			category: 'Folder Names',
			level: 'ERROR',
			message: `Entity id '${dataId}' does not match path segment '${pathSegment}' in '${entityPath}'`,
			path: entityPath
		};
	}

	return null;
}

/** Validate an entity path matches expected structure for its type. */
function validateEntityPath(entityPath: string, entityType: string): boolean {
	if (typeof entityPath !== 'string') return false;
	const parts = entityPath.split('/');

	for (const part of parts) {
		if (!SAFE_SEGMENT.test(part)) return false;
	}

	if (entityType === 'store') {
		return parts.length === 2 && parts[0] === 'stores';
	}
	if (entityType === 'brand') {
		return parts.length === 2 && parts[0] === 'brands';
	}
	if (entityType === 'material') {
		return parts.length === 4 && parts[0] === 'brands' && parts[2] === 'materials';
	}
	if (entityType === 'filament') {
		return (
			parts.length === 6 &&
			parts[0] === 'brands' &&
			parts[2] === 'materials' &&
			parts[4] === 'filaments'
		);
	}
	if (entityType === 'variant') {
		return (
			parts.length === 8 &&
			parts[0] === 'brands' &&
			parts[2] === 'materials' &&
			parts[4] === 'filaments' &&
			parts[6] === 'variants'
		);
	}

	return false;
}

// --- Image validation ---

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg']);
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;

function validateImages(images: Record<string, unknown>): ValidationError[] {
	const errors: ValidationError[] = [];

	for (const [imageId, raw] of Object.entries(images)) {
		if (typeof raw !== 'object' || raw === null) {
			errors.push({ category: 'Images', level: 'ERROR', message: `Invalid image data for ${imageId}` });
			continue;
		}
		const imageData = raw as Record<string, unknown>;

		// Filename
		if (typeof imageData.filename !== 'string' || !imageData.filename) {
			errors.push({ category: 'Images', level: 'ERROR', message: `Missing filename for image ${imageId}` });
			continue;
		}
		const dotIdx = imageData.filename.lastIndexOf('.');
		const ext = dotIdx >= 0 ? imageData.filename.slice(dotIdx).toLowerCase() : '';
		if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
			errors.push({
				category: 'Images',
				level: 'ERROR',
				message: `Invalid image extension '${ext}' for ${imageId}. Allowed: ${[...ALLOWED_IMAGE_EXTENSIONS].join(', ')}`
			});
		}

		// MIME type
		if (imageData.mimeType && !ALLOWED_MIME_TYPES.has(imageData.mimeType as string)) {
			errors.push({
				category: 'Images',
				level: 'ERROR',
				message: `Invalid MIME type '${imageData.mimeType}' for image ${imageId}`
			});
		}

		// Base64 data
		if (typeof imageData.data === 'string') {
			if (!BASE64_REGEX.test(imageData.data)) {
				errors.push({ category: 'Images', level: 'ERROR', message: `Invalid base64 data for image ${imageId}` });
			}
			const approxSize = (imageData.data.length * 3) / 4;
			if (approxSize > MAX_IMAGE_SIZE_BYTES) {
				errors.push({ category: 'Images', level: 'ERROR', message: `Image ${imageId} exceeds 5MB size limit` });
			}

			// Logo dimension/structure validation
			if (
				typeof imageData.mimeType === 'string' &&
				ALLOWED_MIME_TYPES.has(imageData.mimeType) &&
				/^logo\.(png|jpg|jpeg|svg)$/i.test(imageData.filename)
			) {
				errors.push(
					...validateLogoDimensions(imageData.mimeType as string, imageData.data, imageId)
				);
			}
		}
	}

	return errors;
}

// --- GTIN checksum validation ---

/**
 * Validate a GTIN (Global Trade Item Number) checksum.
 * Supports GTIN-8, GTIN-12, GTIN-13, and GTIN-14.
 * Returns true if valid, false if invalid.
 */
function isValidGtin(gtin: string): boolean {
	// Must be all digits, 8/12/13/14 characters
	if (!/^\d{8}$|^\d{12,14}$/.test(gtin)) return false;

	const digits = gtin.split('').map(Number);
	const checkDigit = digits.pop()!;

	// Multiply alternating digits by 1 and 3 (from right, excluding check digit)
	let sum = 0;
	for (let i = digits.length - 1; i >= 0; i--) {
		const multiplier = (digits.length - i) % 2 === 0 ? 1 : 3;
		sum += digits[i] * multiplier;
	}

	const expected = (10 - (sum % 10)) % 10;
	return checkDigit === expected;
}

/**
 * Validate store ID cross-references and GTIN checksums in sizes data.
 */
function validateSizesData(
	sizesData: unknown,
	entityPath: string,
	knownStoreIds: Set<string>,
	newStoreIds: Set<string>
): ValidationError[] {
	const errors: ValidationError[] = [];
	if (!Array.isArray(sizesData)) return errors;

	for (let si = 0; si < sizesData.length; si++) {
		const size = sizesData[si];
		if (typeof size !== 'object' || size === null) continue;
		const sizeObj = size as Record<string, unknown>;

		// GTIN checksum validation
		if (typeof sizeObj.gtin === 'string' && sizeObj.gtin.length > 0) {
			if (!isValidGtin(sizeObj.gtin)) {
				errors.push({
					category: 'GTIN',
					level: 'ERROR',
					message: `Invalid GTIN checksum: '${sizeObj.gtin}' (size #${si + 1})`,
					path: entityPath
				});
			}
		}

		// Store ID cross-reference validation in purchase_links
		const links = sizeObj.purchase_links;
		if (Array.isArray(links)) {
			for (let li = 0; li < links.length; li++) {
				const link = links[li];
				if (typeof link !== 'object' || link === null) continue;
				const linkObj = link as Record<string, unknown>;
				const storeId = linkObj.store_id;

				if (typeof storeId === 'string' && storeId.length > 0) {
					if (!knownStoreIds.has(storeId) && !newStoreIds.has(storeId)) {
						errors.push({
							category: 'Store IDs',
							level: 'ERROR',
							message: `Unknown store_id '${storeId}' in purchase_links (size #${si + 1}, link #${li + 1})`,
							path: entityPath
						});
					}
				}
			}
		}
	}

	return errors;
}

// --- Ajv error formatting ---

function formatAjvError(error: ErrorObject, entityPath: string): ValidationError {
	const location = error.instancePath || '/';
	let msg = error.message || 'Validation failed';

	if (error.keyword === 'additionalProperties') {
		const params = error.params as { additionalProperty?: string };
		msg = `must NOT have additional property '${params.additionalProperty}'`;
	} else if (error.keyword === 'required') {
		const params = error.params as { missingProperty?: string };
		msg = `must have required property '${params.missingProperty}'`;
	} else if (error.keyword === 'enum') {
		const params = error.params as { allowedValues?: unknown[] };
		const allowed = params.allowedValues;
		if (allowed && allowed.length <= 10) {
			msg = `${msg} (allowed: ${allowed.join(', ')})`;
		}
	}

	return {
		category: 'JSON Schema',
		level: 'ERROR',
		message: `${location}: ${msg}`,
		path: entityPath
	};
}

// --- Main validation ---

function emitProgress(job: Job, message: string) {
	job.events.push({ type: 'progress', message });
}

function emitComplete(job: Job, result: ValidationResult) {
	job.status = 'complete';
	job.result = result;
	job.events.push({ type: 'complete', result });
	job.endTime = Date.now();
}

function emitError(job: Job, message: string) {
	job.status = 'error';
	job.events.push({ type: 'error', message });
	job.endTime = Date.now();
}

/**
 * Run cloud-mode validation. Pushes progress/complete/error events to the job
 * so the existing SSE streaming infrastructure delivers them to the client.
 */
export async function runCloudValidation(
	job: Job,
	changes: unknown[],
	images: Record<string, unknown>
): Promise<void> {
	const errors: ValidationError[] = [];

	try {
		// --- Input structure validation ---
		if (!Array.isArray(changes)) {
			emitError(job, 'changes must be an array');
			return;
		}
		if (changes.length > MAX_CHANGES) {
			emitError(job, `Too many changes (${changes.length}). Maximum is ${MAX_CHANGES}.`);
			return;
		}

		// --- Fetch schemas and store list ---
		emitProgress(job, 'Fetching validation schemas...');
		try {
			await prefetchSchemas();
		} catch (err: any) {
			emitError(job, `Failed to fetch schemas: ${err.message}`);
			return;
		}

		let knownStoreIds = new Set<string>();
		try {
			knownStoreIds = await fetchKnownStoreIds();
		} catch {
			// Non-fatal: store ID cross-referencing will be skipped
		}

		// --- Validate entity paths and operations ---
		emitProgress(job, 'Validating entity paths...');
		const validChanges: Array<{ entity: any; operation: string; data: any }> = [];

		// Collect new store IDs from this changeset so they can be referenced
		const newStoreIds = new Set<string>();

		for (const raw of changes) {
			const change = sanitizeObject(raw);
			if (!change) {
				errors.push({ category: 'Input', level: 'ERROR', message: 'Invalid change entry (not an object)' });
				continue;
			}

			const entity = sanitizeObject(change.entity);
			if (!entity) {
				errors.push({ category: 'Input', level: 'ERROR', message: 'Change missing entity field' });
				continue;
			}

			const entityType = String(entity.type || '');
			const entityPath = String(entity.path || '');
			const operation = String(change.operation || '');

			if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
				errors.push({
					category: 'Input',
					level: 'ERROR',
					message: `Unknown entity type: '${entityType}'`,
					path: entityPath
				});
				continue;
			}

			if (!ALLOWED_OPERATIONS.has(operation)) {
				errors.push({
					category: 'Input',
					level: 'ERROR',
					message: `Unknown operation: '${operation}'`,
					path: entityPath
				});
				continue;
			}

			if (!validateEntityPath(entityPath, entityType)) {
				errors.push({
					category: 'Path',
					level: 'ERROR',
					message: `Invalid entity path for type '${entityType}': '${entityPath}'`,
					path: entityPath
				});
				continue;
			}

			// Track new stores being created in this changeset
			if (entityType === 'store' && operation === 'create') {
				const storeData = sanitizeObject(change.data);
				if (storeData && typeof storeData.id === 'string') {
					newStoreIds.add(String(storeData.id));
				}
			}

			validChanges.push({
				entity: { type: entityType, path: entityPath, id: String(entity.id || '') },
				operation,
				data: change.data
			});
		}

		// --- JSON Schema validation ---
		const dataChanges = validChanges.filter((c) => c.operation !== 'delete' && c.data);
		const total = dataChanges.length;

		for (let i = 0; i < total; i++) {
			const change = dataChanges[i];
			const { entity, data: rawData } = change;
			emitProgress(job, `Validating ${entity.type} data (${i + 1}/${total})...`);

			const sanitized = sanitizeObject(rawData);
			if (!sanitized) {
				errors.push({
					category: 'Input',
					level: 'ERROR',
					message: 'Entity data is not a valid object',
					path: entity.path
				});
				continue;
			}

			// Build image filename map for logo resolution
			const imageFilenames = new Map<string, string>();
			if (images && typeof images === 'object') {
				for (const [imageId, imgRaw] of Object.entries(images)) {
					if (imgRaw && typeof imgRaw === 'object' && 'filename' in imgRaw) {
						imageFilenames.set(imageId, String((imgRaw as Record<string, unknown>).filename));
					}
				}
			}

			// Clean internal fields (same as PR creation path)
			const cleaned = cleanEntityData(sanitized, {
				schemaType: entity.type,
				imageFilenames
			});

			// For variants: extract sizes and validate separately
			let sizesData: unknown = undefined;
			if (entity.type === 'variant' && 'sizes' in cleaned) {
				sizesData = cleaned.sizes;
				delete cleaned.sizes;
			}

			// Validate entity data against schema
			try {
				const validate = await compileValidator(entity.type as SchemaName);
				if (!validate(cleaned)) {
					for (const err of validate.errors || []) {
						errors.push(formatAjvError(err, entity.path));
					}
				}
			} catch (err: any) {
				errors.push({
					category: 'JSON Schema',
					level: 'ERROR',
					message: `Schema compilation error for ${entity.type}: ${err.message}`,
					path: entity.path
				});
			}

			// Validate folder naming: entity id must match path segment
			const folderError = validateFolderNaming(entity.path, entity.type, cleaned);
			if (folderError) {
				errors.push(folderError);
			}

			// Validate sizes: schema + GTIN checksums + store ID cross-references
			if (sizesData !== undefined) {
				try {
					const validateSizes = await compileValidator('sizes');
					if (!validateSizes(sizesData)) {
						for (const err of validateSizes.errors || []) {
							errors.push(formatAjvError(err, `${entity.path}/sizes`));
						}
					}
				} catch (err: any) {
					errors.push({
						category: 'JSON Schema',
						level: 'ERROR',
						message: `Sizes schema error: ${err.message}`,
						path: `${entity.path}/sizes`
					});
				}

				errors.push(...validateSizesData(sizesData, entity.path, knownStoreIds, newStoreIds));
			}
		}

		// --- Image validation ---
		if (images && typeof images === 'object' && Object.keys(images).length > 0) {
			emitProgress(job, 'Validating images...');
			errors.push(...validateImages(images));
		}

		// --- Build result ---
		const errorCount = errors.filter((e) => e.level === 'ERROR').length;
		const warningCount = errors.filter((e) => e.level === 'WARNING').length;

		const result: ValidationResult = {
			is_valid: errorCount === 0,
			error_count: errorCount,
			warning_count: warningCount,
			errors
		};

		emitComplete(job, result);
	} catch (err: any) {
		emitError(job, `Cloud validation failed: ${err.message}`);
	}
}
