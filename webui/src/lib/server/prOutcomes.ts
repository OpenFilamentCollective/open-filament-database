/**
 * How a web-editor PR ended up when a maintainer closed it, keyed by PR number.
 *
 * - `returned`: closed without a "Reject" comment while it had feedback. The contributor
 *   was sent the feedback and can load the PR into the editor, fix it and resubmit.
 * - `rejected`: closed after a maintainer comment starting with "Reject"; `reason` is the
 *   rest of that comment.
 * - `closed`: any other close (by the author, by the bot when superseded, nothing to fix).
 * - `open`: reopened after one of the above.
 *
 * Postgres-backed with an in-memory cache, the same arrangement as submissionStore.ts.
 */
import { getPool, ensureTablesOnce } from './db';

export type PrOutcomeKind = 'open' | 'returned' | 'rejected' | 'closed';

export interface PrOutcome {
	prNumber: number;
	outcome: PrOutcomeKind;
	reason?: string;
	closedBy?: string;
	feedbackCount: number;
	/** How the contributor was told: by email, by an @mention on the PR, or not at all. */
	notified?: 'email' | 'mention' | 'none';
	/** The PR a returned one was resubmitted as. */
	supersededBy?: number;
	updatedAt: string;
}

const outcomes = new Map<number, PrOutcome>();

function fromRow(row: any): PrOutcome {
	return {
		prNumber: row.pr_number,
		outcome: row.outcome,
		reason: row.reason ?? undefined,
		closedBy: row.closed_by ?? undefined,
		feedbackCount: row.feedback_count ?? 0,
		notified: row.notified ?? undefined,
		supersededBy: row.superseded_by ?? undefined,
		updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
	};
}

export async function getOutcome(prNumber: number): Promise<PrOutcome | undefined> {
	const cached = outcomes.get(prNumber);
	if (cached) return cached;
	const pool = getPool();
	if (!pool) return undefined;
	await ensureTablesOnce();
	const result = await pool.query('SELECT * FROM pr_outcomes WHERE pr_number = $1', [prNumber]);
	if (!result.rows[0]) return undefined;
	const outcome = fromRow(result.rows[0]);
	outcomes.set(prNumber, outcome);
	return outcome;
}

/** Outcomes for several PRs at once (the status reconcile endpoint). */
export async function getOutcomes(prNumbers: number[]): Promise<Map<number, PrOutcome>> {
	const found = new Map<number, PrOutcome>();
	const missing: number[] = [];
	for (const n of prNumbers) {
		const cached = outcomes.get(n);
		if (cached) found.set(n, cached);
		else missing.push(n);
	}
	const pool = getPool();
	if (pool && missing.length > 0) {
		await ensureTablesOnce();
		const result = await pool.query('SELECT * FROM pr_outcomes WHERE pr_number = ANY($1::int[])', [
			missing
		]);
		for (const row of result.rows) {
			const outcome = fromRow(row);
			outcomes.set(outcome.prNumber, outcome);
			found.set(outcome.prNumber, outcome);
		}
	}
	return found;
}

/** Record an outcome, replacing whatever was there (except a known `supersededBy`). */
export async function setOutcome(
	outcome: Omit<PrOutcome, 'updatedAt' | 'supersededBy'> & { supersededBy?: number }
): Promise<PrOutcome> {
	const previous = outcomes.get(outcome.prNumber);
	const record: PrOutcome = {
		...outcome,
		supersededBy: outcome.supersededBy ?? previous?.supersededBy,
		updatedAt: new Date().toISOString()
	};
	outcomes.set(record.prNumber, record);

	const pool = getPool();
	if (pool) {
		await ensureTablesOnce();
		await pool.query(
			`INSERT INTO pr_outcomes (pr_number, outcome, reason, closed_by, feedback_count, notified, superseded_by, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 ON CONFLICT (pr_number) DO UPDATE SET outcome = $2, reason = $3, closed_by = $4,
			   feedback_count = $5, notified = $6,
			   superseded_by = COALESCE($7, pr_outcomes.superseded_by), updated_at = $8`,
			[
				record.prNumber,
				record.outcome,
				record.reason ?? null,
				record.closedBy ?? null,
				record.feedbackCount,
				record.notified ?? null,
				record.supersededBy ?? null,
				record.updatedAt
			]
		);
	}
	return record;
}

/** Note that a returned PR was resubmitted as `newPrNumber`. */
export async function setSupersededBy(prNumber: number, newPrNumber: number): Promise<void> {
	const existing = await getOutcome(prNumber);
	await setOutcome({
		prNumber,
		outcome: existing?.outcome ?? 'closed',
		reason: existing?.reason,
		closedBy: existing?.closedBy,
		feedbackCount: existing?.feedbackCount ?? 0,
		notified: existing?.notified,
		supersededBy: newPrNumber
	});
}

/** Test helper: forget the in-memory cache. */
export function _resetOutcomeCache(): void {
	outcomes.clear();
}
