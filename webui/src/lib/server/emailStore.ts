/**
 * Separate store for submission email addresses.
 * Kept isolated from submissionStore to ensure PII is never
 * accidentally exposed via status API responses or submissions.json.
 *
 * In-memory with periodic flush to JSON file for persistence across restarts.
 */
import { promises as fs } from 'fs';
import path from 'path';

// uuid → email
const emails = new Map<string, string>();

const STORE_PATH = path.join(process.cwd(), '.data', 'submission-emails.json');

export function storeEmail(uuid: string, email: string): void {
	emails.set(uuid, email);
	flushToDisk().catch((err) => console.warn('Failed to flush emails:', err));
}

export function getEmail(uuid: string): string | undefined {
	return emails.get(uuid);
}

export function removeEmail(uuid: string): void {
	emails.delete(uuid);
	flushToDisk().catch((err) => console.warn('Failed to flush emails:', err));
}

async function flushToDisk(): Promise<void> {
	const dir = path.dirname(STORE_PATH);
	await fs.mkdir(dir, { recursive: true });
	const data = Object.fromEntries(emails);
	await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2));
}

export async function loadFromDisk(): Promise<void> {
	try {
		const content = await fs.readFile(STORE_PATH, 'utf-8');
		const data = JSON.parse(content);
		for (const [uuid, email] of Object.entries(data) as [string, string][]) {
			emails.set(uuid, email);
		}
	} catch {
		// File doesn't exist yet, that's fine
	}
}

// Load persisted data on module init
loadFromDisk().catch(() => {});
