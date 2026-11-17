/**
 * Simple in-memory IP-based rate limiter for anonymous submissions.
 * Sliding window counter per IP address.
 */
import { env as privateEnv } from '$env/dynamic/private';

interface RateEntry {
	timestamps: number[];
}

const entries = new Map<string, RateEntry>();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getLimit(): number {
	return parseInt(privateEnv.ANON_RATE_LIMIT_PER_HOUR || '5', 10);
}

/** Remove timestamps outside the sliding window */
function prune(entry: RateEntry, now: number): void {
	entry.timestamps = entry.timestamps.filter(t => now - t < WINDOW_MS);
}

/**
 * Check if the given IP is allowed to make a submission.
 * Records the attempt if allowed.
 */
export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
	const now = Date.now();
	const limit = getLimit();

	let entry = entries.get(ip);
	if (!entry) {
		entry = { timestamps: [] };
		entries.set(ip, entry);
	}

	prune(entry, now);

	if (entry.timestamps.length >= limit) {
		const oldestInWindow = entry.timestamps[0];
		const retryAfterMs = WINDOW_MS - (now - oldestInWindow);
		return { allowed: false, retryAfterMs };
	}

	entry.timestamps.push(now);
	return { allowed: true };
}

// Periodic cleanup of stale IPs (every 10 minutes)
setInterval(() => {
	const now = Date.now();
	for (const [ip, entry] of entries) {
		prune(entry, now);
		if (entry.timestamps.length === 0) {
			entries.delete(ip);
		}
	}
}, 10 * 60 * 1000).unref();
