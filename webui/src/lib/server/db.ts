/**
 * Postgres connection pool for persistent storage.
 * Used by submissionStore.
 *
 * Requires DATABASE_URL env var. If not set, returns null
 * and stores fall back to in-memory only (no persistence).
 */
import pg from 'pg';
import { env as privateEnv } from '$env/dynamic/private';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
	if (pool) return pool;
	if (!privateEnv.DATABASE_URL) return null;

	pool = new Pool({
		connectionString: privateEnv.DATABASE_URL,
		ssl: privateEnv.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
		max: 5,
		idleTimeoutMillis: 30_000
	});

	pool.on('error', (err) => {
		console.error('Unexpected Postgres pool error:', err.message);
	});

	return pool;
}

/**
 * Run table creation if tables don't exist.
 * Called once on first access from each store.
 */
export async function ensureTables(): Promise<void> {
	const p = getPool();
	if (!p) return;

	await p.query(`
		CREATE TABLE IF NOT EXISTS submissions (
			uuid TEXT PRIMARY KEY,
			pr_number INTEGER NOT NULL,
			pr_url TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			status TEXT NOT NULL DEFAULT 'open',
			change_data TEXT
		)
	`);
}

let tablesReady = false;

export async function ensureTablesOnce(): Promise<void> {
	if (tablesReady) return;
	await ensureTables();
	tablesReady = true;
}
