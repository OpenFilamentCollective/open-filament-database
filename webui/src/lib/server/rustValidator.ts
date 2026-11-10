/**
 * Optional in-process validator backed by the Rust napi binding
 * (`@openfilamentcollective/ofd-validator`).
 *
 * The binding is loaded lazily via a dynamic import so the webui builds and runs whether or
 * not the native package is installed. When present (and the runtime can load native `.node`
 * modules — i.e. a Node/Docker deploy, not serverless), it is preferred over spawning
 * `python3 -m ofd validate`; otherwise callers fall back to their existing path.
 *
 * To enable: install the package into the webui (once published, add it to package.json;
 * for local dev: `npm install --no-save file:../../ofd-validator/crates/ofd-validator-js`).
 * The binding shares the same Rust core as the CLI, so it carries the same rules (including
 * the tracker / variant-material / store-host / duplicate-link warnings).
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { entityPathToRepoPath } from '$lib/server/prBuilder';

interface RustValidationError {
	level: string;
	category: string;
	message: string;
	path?: string | null;
}

interface RustValidationResult {
	errors: RustValidationError[];
	isValid: boolean;
	errorCount: number;
	warningCount: number;
}

interface RustModule {
	validateAll(dataDir: string, storesDir: string, schemasDir?: string): RustValidationResult;
	validateAllWithChanges(
		dataDir: string,
		storesDir: string,
		changesJson: string,
		schemasDir?: string
	): RustValidationResult;
	validateJsonContent(
		content: string,
		schemaName: string,
		schemas: Record<string, string>,
		filePath?: string
	): RustValidationResult;
	validateGtinEanContent(entries: { path: string; content: string }[]): RustValidationResult;
	validateStoreIdsContent(
		storeIds: string[],
		entries: { path: string; content: string }[]
	): RustValidationResult;
}

/** A variant's spool list, to be validated as the sizes.json it becomes. */
export interface PendingSizes {
	/** Where the sizes.json would be written, for error paths. */
	path: string;
	content: string;
}

/**
 * The editor keeps a variant's spools as `sizes` inside the variant's data, but on disk they
 * are a separate sizes.json and variant.json may not contain them. The changes overlay writes
 * the data verbatim, so every variant change with spools failed with "'sizes' was
 * unexpected". Strip `sizes` from variant changes for the overlay and hand them back to be
 * validated as sizes.json content, as cloudValidator.ts does.
 */
export function splitVariantSizes(
	changes: unknown[],
	repoRoot: string
): { changes: unknown[]; sizes: PendingSizes[] } {
	const sizes: PendingSizes[] = [];
	const out = changes.map((raw) => {
		const change = raw as {
			entity?: { type?: string; path?: string };
			data?: any;
			originalData?: any;
		};
		if (change?.entity?.type !== 'variant') return raw;
		const strip = (d: any) => {
			if (!d || typeof d !== 'object' || !('sizes' in d)) return d;
			const { sizes: _sizes, ...rest } = d;
			return rest;
		};
		const data = change.data;
		if (data && typeof data === 'object' && Array.isArray(data.sizes) && change.entity.path) {
			const variantFile = entityPathToRepoPath(change.entity.path);
			if (variantFile) {
				sizes.push({
					path: path.join(repoRoot, variantFile.replace(/variant\.json$/, 'sizes.json')),
					content: JSON.stringify(data.sizes)
				});
			}
		}
		return { ...change, data: strip(change.data), originalData: strip(change.originalData) };
	});
	return { changes: out, sizes };
}

/** The repo's schemas keyed by name (`sizes_schema.json` → `sizes`), for content validation. */
function loadSchemas(schemasDir: string): Record<string, string> {
	const schemas: Record<string, string> = {};
	for (const file of readdirSync(schemasDir)) {
		if (!file.endsWith('.json')) continue;
		schemas[file.replace(/_schema\.json$/, '').replace(/\.json$/, '')] = readFileSync(
			path.join(schemasDir, file),
			'utf8'
		);
	}
	return schemas;
}

/** Known store ids: the stores on disk plus any the changes create. */
function storeIds(storesDir: string, changes: unknown[]): string[] {
	const ids = new Set<string>();
	try {
		for (const entry of readdirSync(storesDir, { withFileTypes: true }))
			if (entry.isDirectory()) ids.add(entry.name);
	} catch {
		// No stores folder: nothing known.
	}
	for (const raw of changes) {
		const change = raw as { entity?: { type?: string; id?: string }; operation?: string };
		if (change?.entity?.type === 'store' && change.operation !== 'delete' && change.entity.id)
			ids.add(change.entity.id);
	}
	return [...ids];
}

function mergeResults(results: RustValidationResult[]): RustValidationResult {
	const errors = results.flatMap((r) => r.errors);
	const errorCount = results.reduce((n, r) => n + r.errorCount, 0);
	return {
		errors,
		errorCount,
		warningCount: results.reduce((n, r) => n + r.warningCount, 0),
		isValid: errorCount === 0
	};
}

/** The `{ is_valid, error_count, ... }` shape the client + existing validators use. */
export interface NormalizedValidationResult {
	is_valid: boolean;
	error_count: number;
	warning_count: number;
	errors: Array<{ level: string; category: string; message: string; path?: string | null }>;
}

// undefined = not yet attempted, null = attempted and unavailable.
let cached: RustModule | null | undefined;

async function loadRust(): Promise<RustModule | null> {
	if (cached !== undefined) return cached;
	try {
		// @vite-ignore keeps the bundler from resolving an optional native package at build
		// time; @ts-ignore because it may not be installed (dynamic, runtime-only).
		// @ts-ignore - optional native package, resolved at runtime when present
		const mod = await import(/* @vite-ignore */ '@openfilamentcollective/ofd-validator');
		cached = (mod as { default?: RustModule }).default ?? (mod as unknown as RustModule);
	} catch {
		cached = null;
	}
	return cached;
}

/** True if the native binding is available in this runtime. */
export async function isRustValidatorAvailable(): Promise<boolean> {
	return (await loadRust()) !== null;
}

function normalize(r: RustValidationResult): NormalizedValidationResult {
	// The `errors` element shape ({ level, category, message, path }) already matches; only the
	// top-level count keys differ (camelCase -> snake_case).
	return {
		is_valid: r.isValid,
		error_count: r.errorCount,
		warning_count: r.warningCount,
		errors: r.errors
	};
}

/**
 * Validate the repo (optionally overlaying pending WebUI changes) via the Rust binding.
 * Returns null when the binding is unavailable, so callers can fall back.
 */
export async function tryRustValidate(
	changes: unknown,
	repoRoot: string
): Promise<NormalizedValidationResult | null> {
	const rust = await loadRust();
	if (!rust) return null;

	const dataDir = path.join(repoRoot, 'data');
	const storesDir = path.join(repoRoot, 'stores');
	const schemasDir = path.join(repoRoot, 'schemas');

	const hasChanges = Array.isArray(changes) && changes.length > 0;
	if (!hasChanges) return normalize(rust.validateAll(dataDir, storesDir, schemasDir));

	const split = splitVariantSizes(changes as unknown[], repoRoot);
	const results = [
		rust.validateAllWithChanges(
			dataDir,
			storesDir,
			JSON.stringify({ changes: split.changes }),
			schemasDir
		)
	];
	if (split.sizes.length > 0) {
		const schemas = loadSchemas(schemasDir);
		for (const s of split.sizes)
			results.push(rust.validateJsonContent(s.content, 'sizes', schemas, s.path));
		results.push(rust.validateGtinEanContent(split.sizes));
		results.push(
			rust.validateStoreIdsContent(storeIds(storesDir, changes as unknown[]), split.sizes)
		);
	}
	return normalize(mergeResults(results));
}
