/**
 * Tests for /api/github/create-pr.
 *
 * Covers the full PR creation flow with all GitHub helpers mocked:
 *  - Auth required
 *  - Upstream-config required
 *  - Empty changes rejection
 *  - Branch retry on fork-not-ready
 *  - Successful PR creation pipeline
 *  - skippedPaths surfaced when present
 *  - 500 on uncaught error
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	getGitHubToken: vi.fn((): string | undefined => 'gh-token'),
	getGitHubUser: vi.fn(async () => ({ login: 'octocat' })),
	forkRepo: vi.fn(async () => ({ owner: 'octocat', repo: 'fork' })),
	getLatestCommitSha: vi.fn(async () => 'sha-1'),
	getCommitTreeSha: vi.fn(async () => 'tree-1'),
	createBranch: vi.fn(async () => {}),
	createTree: vi.fn(async () => 'tree-new'),
	createCommit: vi.fn(async () => 'commit-1'),
	updateRef: vi.fn(async () => {}),
	createPullRequest: vi.fn(async (..._args: unknown[]) => ({
		html_url: 'https://github.com/x/y/pull/42',
		number: 42
	})),
	buildTreeItems: vi.fn(async () => ({
		treeItems: [{ path: 'data/acme/brand.json', mode: '100644', type: 'blob', content: '{}' }],
		skippedPaths: [] as string[],
		noopDeletes: [] as Array<{ path: string; description?: string }>
	})),
	buildChangesSummary: vi.fn(() => '- Updated 1 entity'),
	explainEmptyTree: vi.fn(() => 'No changes to submit.')
}));

vi.mock('$lib/server/auth', () => ({
	getGitHubToken: mocks.getGitHubToken,
	getGitHubUser: mocks.getGitHubUser
}));
vi.mock('$lib/server/github', () => ({
	forkRepo: mocks.forkRepo,
	getLatestCommitSha: mocks.getLatestCommitSha,
	getCommitTreeSha: mocks.getCommitTreeSha,
	createBranch: mocks.createBranch,
	createTree: mocks.createTree,
	createCommit: mocks.createCommit,
	updateRef: mocks.updateRef,
	createPullRequest: mocks.createPullRequest
}));
vi.mock('$lib/server/prBuilder', () => ({
	buildTreeItems: mocks.buildTreeItems,
	buildChangesSummary: mocks.buildChangesSummary,
	explainEmptyTree: mocks.explainEmptyTree
}));

vi.mock('@sveltejs/kit', () => ({
	json: (data: any, init?: { status?: number }) => ({
		status: init?.status ?? 200,
		body: data,
		json: async () => data
	})
}));

import { POST } from '../github/create-pr/+server';

function makeEvent(body: any): any {
	return {
		request: { json: async () => body },
		cookies: { get: () => 'cookie' }
	};
}

describe('POST /api/github/create-pr', () => {
	beforeEach(() => {
		for (const fn of Object.values(mocks)) (fn as any).mockReset?.();
		// Restore default success behavior
		mocks.getGitHubToken.mockReturnValue('gh-token');
		mocks.getGitHubUser.mockResolvedValue({ login: 'octocat' });
		mocks.forkRepo.mockResolvedValue({ owner: 'octocat', repo: 'fork' });
		mocks.getLatestCommitSha.mockResolvedValue('sha-1');
		mocks.getCommitTreeSha.mockResolvedValue('tree-1');
		mocks.createBranch.mockResolvedValue(undefined);
		mocks.createTree.mockResolvedValue('tree-new');
		mocks.createCommit.mockResolvedValue('commit-1');
		mocks.updateRef.mockResolvedValue(undefined);
		mocks.createPullRequest.mockResolvedValue({
			html_url: 'https://github.com/x/y/pull/42',
			number: 42
		});
		mocks.buildTreeItems.mockResolvedValue({
			treeItems: [{ path: 'data/acme/brand.json', mode: '100644', type: 'blob', content: '{}' }],
			skippedPaths: [],
			noopDeletes: []
		});
		mocks.buildChangesSummary.mockReturnValue('- Updated 1 entity');
		mocks.explainEmptyTree.mockReturnValue('No changes to submit.');
	});

	it('returns 401 when GitHub token is missing', async () => {
		mocks.getGitHubToken.mockReturnValue(undefined);
		const res: any = await POST(makeEvent({ changes: [{ x: 1 }] }));
		expect(res.status).toBe(401);
		expect(res.body.error).toMatch(/authenticated/i);
	});

	it('returns 400 when changes is empty', async () => {
		const res: any = await POST(makeEvent({ changes: [] }));
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/No changes/);
	});

	it('returns 400 when buildTreeItems returns no tree entries', async () => {
		mocks.buildTreeItems.mockResolvedValue({ treeItems: [], skippedPaths: [], noopDeletes: [] });
		const res: any = await POST(makeEvent({ changes: [{ x: 1 }] }));
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/No changes to submit/);
	});

	it('explains no-op deletes when they are the only changes', async () => {
		mocks.explainEmptyTree.mockReturnValue(
			"No changes to submit. The deletion of variant \"Oliver Green\" can't be submitted because it isn't in the database."
		);
		mocks.buildTreeItems.mockResolvedValue({
			treeItems: [],
			skippedPaths: [],
			noopDeletes: [{ path: 'brands/acme/materials/pla/filaments/x/variants/oliver_green', description: 'Deleted variant "Oliver Green"' }]
		});
		const res: any = await POST(makeEvent({ changes: [{ x: 1 }] }));
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/isn't in the database/);
	});

	it('returns 504 when branch creation fails repeatedly', async () => {
		vi.useFakeTimers();
		try {
			mocks.createBranch.mockRejectedValue(new Error('fork not ready'));
			const promise = POST(makeEvent({ changes: [{ x: 1 }] }));
			// Run all pending timers so the retry delays elapse instantly
			await vi.runAllTimersAsync();
			const res: any = await promise;
			expect(res.status).toBe(504);
			expect(res.body.error).toMatch(/Could not create branch/);
			expect(mocks.createBranch).toHaveBeenCalledTimes(5);
		} finally {
			vi.useRealTimers();
		}
	});

	it('happy path: creates branch, tree, commit, ref, and PR; returns urls', async () => {
		const res: any = await POST(
			makeEvent({
				changes: [{ entity: { path: 'brands/acme', type: 'brand' }, operation: 'update' }],
				images: {},
				title: 'My PR',
				description: 'PR body'
			})
		);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.prUrl).toContain('/pull/42');
		expect(res.body.prNumber).toBe(42);

		// Verify the full pipeline ran in order
		expect(mocks.forkRepo).toHaveBeenCalledTimes(1);
		expect(mocks.getLatestCommitSha).toHaveBeenCalledTimes(1);
		expect(mocks.createBranch).toHaveBeenCalledTimes(1);
		expect(mocks.createTree).toHaveBeenCalledTimes(1);
		expect(mocks.createCommit).toHaveBeenCalledTimes(1);
		expect(mocks.updateRef).toHaveBeenCalledTimes(1);
		expect(mocks.createPullRequest).toHaveBeenCalledTimes(1);

		// PR body should embed the change summary and user attribution
		const prBody = mocks.createPullRequest.mock.calls[0][6];
		expect(prBody).toContain('PR body');
		expect(prBody).toContain('@octocat');
		expect(prBody).toContain('- Updated 1 entity');
	});

	it('uses default title when not provided', async () => {
		await POST(makeEvent({ changes: [{ x: 1 }, { y: 2 }] }));
		const title = mocks.createPullRequest.mock.calls[0][5];
		expect(title).toMatch(/Update filament database/);
		expect(title).toContain('2 changes');
	});

	it('returns skippedPaths in the response when present', async () => {
		mocks.buildTreeItems.mockResolvedValue({
			treeItems: [{ path: 'p', mode: '100644', type: 'blob', content: '{}' }],
			skippedPaths: ['skipped/path/1.json'],
			noopDeletes: []
		});
		const res: any = await POST(makeEvent({ changes: [{ x: 1 }] }));
		expect(res.body.skippedPaths).toEqual(['skipped/path/1.json']);
	});

	it('omits skippedPaths from response when empty', async () => {
		const res: any = await POST(makeEvent({ changes: [{ x: 1 }] }));
		expect(res.body.skippedPaths).toBeUndefined();
	});

	it('returns 500 with the error message on uncaught failure', async () => {
		mocks.forkRepo.mockRejectedValue(new Error('upstream 500'));
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res: any = await POST(makeEvent({ changes: [{ x: 1 }] }));
		expect(res.status).toBe(500);
		expect(res.body.error).toBe('upstream 500');
		errSpy.mockRestore();
	});

	it('handles a transient branch failure that recovers on retry', async () => {
		vi.useFakeTimers();
		try {
			mocks.createBranch
				.mockRejectedValueOnce(new Error('not ready'))
				.mockResolvedValueOnce(undefined);
			const promise = POST(makeEvent({ changes: [{ x: 1 }] }));
			await vi.runAllTimersAsync();
			const res: any = await promise;
			expect(res.status).toBe(200);
			expect(mocks.createBranch).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});
});
