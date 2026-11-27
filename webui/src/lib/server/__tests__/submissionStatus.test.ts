/**
 * Where a submission stands for its contributor (submissionContext.submissionStatus).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { submissionStatus } from '$lib/server/submissionContext';

const open = { merged: false, state: 'open' } as any;
const item = (createdAt: string) => ({ createdAt });

describe('submissionStatus', () => {
	it('an open PR with feedback needs the contributor', () => {
		expect(submissionStatus(open, undefined, [item('2026-11-01T00:00:00Z')])).toBe('feedback');
		expect(submissionStatus(open, undefined, [])).toBe('open');
	});

	it('is back with the reviewer once fixes were sent after all the feedback', () => {
		const items = [item('2026-11-01T00:00:00Z')];
		expect(submissionStatus(open, undefined, items, '2026-11-02T00:00:00Z')).toBe('open');
		// New feedback after the fix: the contributor is needed again.
		expect(
			submissionStatus(open, undefined, [...items, item('2026-11-03T00:00:00Z')], '2026-11-02T00:00:00Z')
		).toBe('feedback');
	});

	it('closed PRs follow their outcome', () => {
		const closed = { merged: false, state: 'closed' } as any;
		expect(submissionStatus({ merged: true, state: 'closed' } as any, undefined, [])).toBe('merged');
		expect(submissionStatus(closed, { outcome: 'returned' } as any, [])).toBe('returned');
		expect(submissionStatus(closed, { outcome: 'rejected' } as any, [])).toBe('rejected');
		expect(submissionStatus(closed, undefined, [])).toBe('closed');
	});
});
