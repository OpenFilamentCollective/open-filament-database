/**
 * Tracks submission UUIDs and their associated PR numbers.
 * Primary lookup is stateless (UUID embedded in PR body as HTML comment).
 * This store is a backup index for fast lookup without GitHub API calls.
 *
 * Uses Postgres for persistence (via DATABASE_URL) with in-memory cache.
 * Falls back to in-memory only if DATABASE_URL is not set.
 */
import { getPool, ensureTablesOnce } from './db';

export interface SubmissionRecord {
	uuid: string;
	prNumber: number;
	prUrl: string;
	createdAt: string; // ISO 8601
	status: 'open' | 'merged' | 'closed' | 'changes_requested';
	changeData?: string; // Serialized ChangeExport JSON for deflation
	email?: string; // Submitter email for notifications
}

// In-memory cache
const submissions = new Map<string, SubmissionRecord>();
const prNumberIndex = new Map<number, string>(); // prNumber → uuid

export function trackSubmission(uuid: string, prNumber: number, prUrl: string, changeData?: string, email?: string): void {
	const record: SubmissionRecord = {
		uuid,
		prNumber,
		prUrl,
		createdAt: new Date().toISOString(),
		status: 'open',
		changeData,
		email
	};
	submissions.set(uuid, record);
	prNumberIndex.set(prNumber, uuid);
	persistSubmission(record).catch((err) => console.warn('Failed to persist submission:', err));
}

export function getSubmission(uuid: string): SubmissionRecord | undefined {
	return submissions.get(uuid);
}

export function getUuidByPrNumber(prNumber: number): string | undefined {
	return prNumberIndex.get(prNumber);
}

export function getEmailByUuid(uuid: string): string | undefined {
	return submissions.get(uuid)?.email;
}

/** DB fallback for email lookup — used by webhook handler when in-memory cache may be stale */
export async function getEmailByUuidFromDb(uuid: string): Promise<string | undefined> {
	// Try memory first
	const cached = submissions.get(uuid)?.email;
	if (cached) return cached;

	// Fall back to DB
	const pool = getPool();
	if (!pool) return undefined;
	await ensureTablesOnce();
	const result = await pool.query('SELECT email FROM submissions WHERE uuid = $1', [uuid]);
	return result.rows[0]?.email || undefined;
}

export function updateStatus(uuid: string, status: 'merged' | 'closed' | 'changes_requested'): void {
	const record = submissions.get(uuid);
	if (record) {
		record.status = status;
		persistStatus(uuid, status).catch((err) => console.warn('Failed to persist status:', err));
	}
}

// --- Postgres persistence ---

async function persistSubmission(record: SubmissionRecord): Promise<void> {
	const pool = getPool();
	if (!pool) return;
	await ensureTablesOnce();
	await pool.query(
		`INSERT INTO submissions (uuid, pr_number, pr_url, created_at, status, change_data, email)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (uuid) DO UPDATE SET pr_number = $2, pr_url = $3, status = $5, change_data = $6, email = $7`,
		[record.uuid, record.prNumber, record.prUrl, record.createdAt, record.status, record.changeData || null, record.email || null]
	);
}

async function persistStatus(uuid: string, status: string): Promise<void> {
	const pool = getPool();
	if (!pool) return;
	await ensureTablesOnce();
	await pool.query('UPDATE submissions SET status = $1 WHERE uuid = $2', [status, uuid]);
}

export async function loadFromDatabase(): Promise<void> {
	const pool = getPool();
	if (!pool) return;
	await ensureTablesOnce();
	const result = await pool.query('SELECT uuid, pr_number, pr_url, created_at, status, change_data, email FROM submissions');
	for (const row of result.rows) {
		const record: SubmissionRecord = {
			uuid: row.uuid,
			prNumber: row.pr_number,
			prUrl: row.pr_url,
			createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
			status: row.status,
			changeData: row.change_data || undefined,
			email: row.email || undefined
		};
		submissions.set(record.uuid, record);
		prNumberIndex.set(record.prNumber, record.uuid);
	}
}

// Load persisted data on module init
loadFromDatabase().catch(() => {});
