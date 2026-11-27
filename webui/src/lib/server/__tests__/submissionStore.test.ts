/** The in-memory submission records (submissionStore.ts); no DATABASE_URL in tests. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ getPool: () => null, ensureTablesOnce: async () => {} }));

import { trackSubmission, getEmailByUuid } from '$lib/server/submissionStore';

describe('trackSubmission', () => {
	it('keeps the stored email when an amend re-tracks the submission without one', () => {
		trackSubmission('u-1', 1, 'https://x/pull/1', '{}', 'maker@example.com');
		trackSubmission('u-1', 1, 'https://x/pull/1', '{"changes":[]}', undefined);
		expect(getEmailByUuid('u-1')).toBe('maker@example.com');
	});
});
