/**
 * Tests for /api/submissions/status — the client's merge-state reconciliation.
 *
 * The endpoint's job is twofold: report each PR's real state, and hand back GitHub's
 * `merged_at` so the client can anchor overlay eviction to the merge rather than to
 * whenever it happened to ask. A locally-cached 'merged' must therefore still hit
 * GitHub for the timestamp; only 'closed' can be answered from the cache alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	getPullRequest: vi.fn(),
	getInstallationToken: vi.fn(async () => 'tok'),
	getUuidByPrNumber: vi.fn((n: number) => `uuid-${n}`),
	getSubmission: vi.fn(),
	updateStatus: vi.fn()
}));

vi.mock('$lib/server/github', () => ({ getPullRequest: mocks.getPullRequest }));
vi.mock('$lib/server/githubApp', () => ({ getInstallationToken: mocks.getInstallationToken }));
vi.mock('$lib/server/submissionStore', () => ({
	getUuidByPrNumber: mocks.getUuidByPrNumber,
	getSubmission: mocks.getSubmission,
	updateStatus: mocks.updateStatus
}));
vi.mock('$env/dynamic/private', () => ({
	env: { GITHUB_UPSTREAM_OWNER: 'owner', GITHUB_UPSTREAM_REPO: 'repo' }
}));
vi.mock('@sveltejs/kit', () => ({
	json: (data: any, init?: { status?: number }) => ({
		status: init?.status ?? 200,
		body: data
	})
}));

import { POST } from '../submissions/status/+server';

const makeEvent = (body: any): any => ({ request: { json: async () => body } });

const MERGED_AT = '2026-08-18T22:10:00Z';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getInstallationToken.mockResolvedValue('tok');
	mocks.getUuidByPrNumber.mockImplementation((n: number) => `uuid-${n}`);
	mocks.getSubmission.mockReturnValue(undefined);
});

describe('POST /api/submissions/status', () => {
	it('rejects a non-array prNumbers', async () => {
		const res: any = await POST(makeEvent({ prNumbers: 'nope' }));
		expect(res.status).toBe(400);
	});

	it('returns the upstream state and merge time for an unknown PR', async () => {
		mocks.getPullRequest.mockResolvedValue({
			merged: true,
			state: 'closed',
			merged_at: MERGED_AT
		});
		const res: any = await POST(makeEvent({ prNumbers: [459] }));
		expect(res.body.statuses[459]).toBe('merged');
		expect(res.body.mergedAt[459]).toBe(MERGED_AT);
		expect(mocks.updateStatus).toHaveBeenCalledWith('uuid-459', 'merged');
	});

	it('still fetches merged_at for a PR already cached as merged', async () => {
		// The store has no merge-time column, so short-circuiting here would leave the
		// client falling back to "now" and over-extending the submitted overlay.
		mocks.getSubmission.mockReturnValue({ status: 'merged' });
		mocks.getPullRequest.mockResolvedValue({
			merged: true,
			state: 'closed',
			merged_at: MERGED_AT
		});
		const res: any = await POST(makeEvent({ prNumbers: [459] }));
		expect(mocks.getPullRequest).toHaveBeenCalledOnce();
		expect(res.body.statuses[459]).toBe('merged');
		expect(res.body.mergedAt[459]).toBe(MERGED_AT);
		// Already terminal in the store — nothing new to persist.
		expect(mocks.updateStatus).not.toHaveBeenCalled();
	});

	it('answers a cached closed PR without calling GitHub', async () => {
		mocks.getSubmission.mockReturnValue({ status: 'closed' });
		const res: any = await POST(makeEvent({ prNumbers: [460] }));
		expect(mocks.getPullRequest).not.toHaveBeenCalled();
		expect(res.body.statuses[460]).toBe('closed');
	});

	it('keeps a known merge when GitHub is unreachable', async () => {
		mocks.getSubmission.mockReturnValue({ status: 'merged' });
		mocks.getPullRequest.mockRejectedValue(new Error('502'));
		const res: any = await POST(makeEvent({ prNumbers: [459] }));
		expect(res.body.statuses[459]).toBe('merged');
		expect(res.body.mergedAt[459]).toBeUndefined();
	});

	it('reports unknown when an uncached PR cannot be fetched', async () => {
		mocks.getPullRequest.mockResolvedValue(null);
		const res: any = await POST(makeEvent({ prNumbers: [999] }));
		expect(res.body.statuses[999]).toBe('unknown');
	});

	it('preserves a changes_requested status for a still-open PR', async () => {
		mocks.getSubmission.mockReturnValue({ status: 'changes_requested' });
		mocks.getPullRequest.mockResolvedValue({ merged: false, state: 'open' });
		const res: any = await POST(makeEvent({ prNumbers: [461] }));
		expect(res.body.statuses[461]).toBe('changes_requested');
	});
});
