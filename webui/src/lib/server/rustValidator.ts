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
	const result = hasChanges
		? rust.validateAllWithChanges(dataDir, storesDir, JSON.stringify({ changes }), schemasDir)
		: rust.validateAll(dataDir, storesDir, schemasDir);

	return normalize(result);
}
