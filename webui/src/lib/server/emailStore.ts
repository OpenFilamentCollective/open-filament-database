/**
 * Separate store for submission email addresses.
 * Kept as a separate module from submissionStore to ensure PII is never
 * accidentally exposed via status API responses.
 *
 * Uses the `email` column on the shared `submissions` Postgres table.
 * Falls back to in-memory only if DATABASE_URL is not set.
 */
import { getPool, ensureTablesOnce } from './db';

// In-memory cache: uuid → email
const emails = new Map<string, string>();

export function storeEmail(uuid: string, email: string): void {
	emails.set(uuid, email);
	persistEmail(uuid, email).catch((err) => console.warn('Failed to persist email:', err));
}

export function getEmail(uuid: string): string | undefined {
	return emails.get(uuid);
}

export function removeEmail(uuid: string): void {
	emails.delete(uuid);
	clearPersistedEmail(uuid).catch((err) => console.warn('Failed to clear email:', err));
}

// --- Postgres persistence ---

async function persistEmail(uuid: string, email: string): Promise<void> {
	const pool = getPool();
	if (!pool) return;
	await ensureTablesOnce();
	await pool.query('UPDATE submissions SET email = $1 WHERE uuid = $2', [email, uuid]);
}

async function clearPersistedEmail(uuid: string): Promise<void> {
	const pool = getPool();
	if (!pool) return;
	await ensureTablesOnce();
	await pool.query('UPDATE submissions SET email = NULL WHERE uuid = $1', [uuid]);
}

export async function loadFromDatabase(): Promise<void> {
	const pool = getPool();
	if (!pool) return;
	await ensureTablesOnce();
	const result = await pool.query('SELECT uuid, email FROM submissions WHERE email IS NOT NULL');
	for (const row of result.rows) {
		emails.set(row.uuid, row.email);
	}
}

// Load persisted data on module init
loadFromDatabase().catch(() => {});
