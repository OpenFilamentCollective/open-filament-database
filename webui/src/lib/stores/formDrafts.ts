/**
 * In-memory form draft store.
 *
 * Preserves form state across modal close/reopen within a single page-load
 * session. Cleared on successful submit by the calling page. Not persisted
 * to localStorage by design — refreshing the page discards drafts.
 *
 * Each form decides what shape to store; the store deep-clones on write
 * so callers don't need to detach Svelte proxies before passing in data.
 * Sets must be converted to arrays before storing (JSON cannot serialize them).
 */

const drafts = new Map<string, any>();

export const formDrafts = {
	get<T = any>(key: string): T | undefined {
		return drafts.get(key) as T | undefined;
	},
	set(key: string, data: any): void {
		drafts.set(key, JSON.parse(JSON.stringify(data)));
	},
	has(key: string): boolean {
		return drafts.has(key);
	},
	clear(key: string): void {
		drafts.delete(key);
	}
};
