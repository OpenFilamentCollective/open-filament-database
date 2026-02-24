/**
 * Tracks submission UUIDs and their associated PR numbers.
 * Primary lookup is stateless (UUID embedded in PR body as HTML comment).
 * This store is a backup index for fast lookup without GitHub API calls.
 *
 * In-memory with periodic flush to JSON file for persistence across restarts.
 * Never stores email or any user-identifying information.
 */
import { promises as fs } from 'fs';
import path from 'path';

export interface SubmissionRecord {
	uuid: string;
	prNumber: number;
	prUrl: string;
	createdAt: string; // ISO 8601
	status: 'open' | 'merged' | 'closed';
}

// In-memory indexes
const submissions = new Map<string, SubmissionRecord>();
const prNumberIndex = new Map<number, string>(); // prNumber → uuid

const STORE_PATH = path.join(process.cwd(), '.data', 'submissions.json');

export function trackSubmission(uuid: string, prNumber: number, prUrl: string): void {
	const record: SubmissionRecord = {
		uuid,
		prNumber,
		prUrl,
		createdAt: new Date().toISOString(),
		status: 'open'
	};
	submissions.set(uuid, record);
	prNumberIndex.set(prNumber, uuid);
	flushToDisk().catch(err => console.warn('Failed to flush submissions:', err));
}

export function getSubmission(uuid: string): SubmissionRecord | undefined {
	return submissions.get(uuid);
}

export function getUuidByPrNumber(prNumber: number): string | undefined {
	return prNumberIndex.get(prNumber);
}

export function updateStatus(uuid: string, status: 'merged' | 'closed'): void {
	const record = submissions.get(uuid);
	if (record) {
		record.status = status;
		flushToDisk().catch(err => console.warn('Failed to flush submissions:', err));
	}
}

async function flushToDisk(): Promise<void> {
	const dir = path.dirname(STORE_PATH);
	await fs.mkdir(dir, { recursive: true });
	const data = Object.fromEntries(submissions);
	await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2));
}

export async function loadFromDisk(): Promise<void> {
	try {
		const content = await fs.readFile(STORE_PATH, 'utf-8');
		const data = JSON.parse(content);
		for (const [uuid, record] of Object.entries(data) as [string, SubmissionRecord][]) {
			submissions.set(uuid, record);
			prNumberIndex.set(record.prNumber, uuid);
		}
	} catch {
		// File doesn't exist yet, that's fine
	}
}

// Load persisted data on module init
loadFromDisk().catch(() => {});
