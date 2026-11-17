/**
 * Tests for the maintainer "LGTM & merge" page (/review/merge/[pr]).
 *
 * All GitHub helpers are mocked; the real SvelteKit `redirect`/`fail` are used so the
 * assertions see exactly what the framework would.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { safeReturnPath } from '$lib/server/auth';

const mocks = vi.hoisted(() => ({
	getGitHubToken: vi.fn(),
	getGitHubUser: vi.fn(),
	getRepoPermission: vi.fn(),
	getPullRequestForReview: vi.fn(),
	getCheckSummary: vi.fn(),
	createIssueComment: vi.fn(),
	mergePullRequest: vi.fn()
}));

vi.mock('$lib/server/auth', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/auth')>()),
	getGitHubToken: mocks.getGitHubToken,
	getGitHubUser: mocks.getGitHubUser
}));
vi.mock('$lib/server/github', () => ({
	MERGE_PERMISSIONS: new Set(['admin', 'maintain', 'write']),
	getRepoPermission: mocks.getRepoPermission,
	getPullRequestForReview: mocks.getPullRequestForReview,
	getCheckSummary: mocks.getCheckSummary,
	createIssueComment: mocks.createIssueComment,
	mergePullRequest: mocks.mergePullRequest
}));

import { load, actions } from '../../review/merge/[pr]/+page.server';
import { LGTM_MESSAGE } from '$lib/config/reviewMessages';

const PR = {
	number: 42,
	title: 'Add OWL Filament',
	html_url: 'https://github.com/TestOwner/test-repo/pull/42',
	state: 'open',
	merged: false,
	draft: false,
	author: 'contributor',
	head_sha: 'abc123',
	mergeable: true,
	mergeable_state: 'clean',
	changed_files: 3,
	additions: 10,
	deletions: 0
};

function event(form: Record<string, string> = {}): any {
	const data = new FormData();
	for (const [k, v] of Object.entries(form)) data.set(k, v);
	return {
		params: { pr: '42' },
		cookies: { get: () => undefined },
		url: new URL('http://localhost/review/merge/42'),
		request: { formData: async () => data }
	};
}

async function thrown(promise: unknown): Promise<any> {
	try {
		await promise;
	} catch (err) {
		return err;
	}
	throw new Error('expected a throw');
}

beforeEach(() => {
	for (const fn of Object.values(mocks)) fn.mockReset();
	mocks.getGitHubToken.mockReturnValue('user-token');
	mocks.getGitHubUser.mockResolvedValue({ login: 'maintainer' });
	mocks.getRepoPermission.mockResolvedValue('write');
	mocks.getPullRequestForReview.mockResolvedValue({ ...PR });
	mocks.getCheckSummary.mockResolvedValue({ passed: 4, failed: [], pending: [], blocking: [] });
});

describe('load', () => {
	it('sends a signed-out visitor to GitHub login and back here', async () => {
		mocks.getGitHubToken.mockReturnValue(undefined);
		const err = await thrown(load(event()));
		expect(isRedirect(err)).toBe(true);
		expect(err.location).toBe('/api/auth/github/login?returnTo=%2Freview%2Fmerge%2F42');
	});

	it('refuses users without write access', async () => {
		mocks.getRepoPermission.mockResolvedValue('read');
		const data = (await load(event())) as any;
		expect(data.forbidden).toBe(true);
		expect(mocks.getPullRequestForReview).not.toHaveBeenCalled();
	});

	it('shows the PR, its checks and the LGTM message to a maintainer', async () => {
		const data = (await load(event())) as any;
		expect(data.forbidden).toBe(false);
		expect(data.pr.head_sha).toBe('abc123');
		expect(data.message).toBe(LGTM_MESSAGE);
	});
});

describe('merge action', () => {
	it('merges the reviewed head, then comments as the maintainer', async () => {
		const err = await thrown(actions.merge(event({ sha: 'abc123', message: LGTM_MESSAGE })));
		expect(isRedirect(err)).toBe(true);
		expect(err.location).toBe(PR.html_url);
		expect(mocks.mergePullRequest).toHaveBeenCalledWith('user-token', 'TestOwner', 'test-repo', 42, 'abc123');
		expect(mocks.createIssueComment).toHaveBeenCalledWith(
			'user-token',
			'TestOwner',
			'test-repo',
			42,
			LGTM_MESSAGE
		);
		expect(mocks.mergePullRequest.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.createIssueComment.mock.invocationCallOrder[0]
		);
	});

	it('refuses when commits were pushed after the page loaded', async () => {
		const result: any = await actions.merge(event({ sha: 'old-sha', message: 'LGTM' }));
		expect(result.status).toBe(409);
		expect(mocks.mergePullRequest).not.toHaveBeenCalled();
		expect(mocks.createIssueComment).not.toHaveBeenCalled();
	});

	it('refuses users without write access', async () => {
		mocks.getRepoPermission.mockResolvedValue('triage');
		const result: any = await actions.merge(event({ sha: 'abc123' }));
		expect(result.status).toBe(403);
		expect(mocks.mergePullRequest).not.toHaveBeenCalled();
	});

	it('does not comment when GitHub refuses the merge', async () => {
		mocks.mergePullRequest.mockRejectedValue(new Error('Failed to merge: 405 - not mergeable'));
		const result: any = await actions.merge(event({ sha: 'abc123' }));
		expect(result.status).toBe(502);
		expect(result.data.error).toContain('not mergeable');
		expect(mocks.createIssueComment).not.toHaveBeenCalled();
	});

	it('refuses while a merge gate such as the brand sign-off is not green', async () => {
		mocks.getCheckSummary.mockResolvedValue({
			passed: 3,
			failed: [],
			pending: ['Brand sign-off'],
			blocking: [{ context: 'Brand sign-off', state: 'pending', description: '', url: null }]
		});
		const result: any = await actions.merge(event({ sha: 'abc123' }));
		expect(result.status).toBe(409);
		expect(result.data.error).toContain('Brand sign-off is pending');
		expect(mocks.mergePullRequest).not.toHaveBeenCalled();
		expect(mocks.createIssueComment).not.toHaveBeenCalled();
	});

	it('falls back to the LGTM message when the textarea is emptied', async () => {
		await thrown(actions.merge(event({ sha: 'abc123', message: '   ' })));
		expect(mocks.createIssueComment.mock.calls[0][4]).toBe(LGTM_MESSAGE);
	});
});

describe('safeReturnPath', () => {
	it('accepts same-origin paths only', () => {
		expect(safeReturnPath('/review/merge/42')).toBe('/review/merge/42');
		expect(safeReturnPath('//evil.example')).toBeNull();
		expect(safeReturnPath('/\\evil.example')).toBeNull();
		expect(safeReturnPath('https://evil.example')).toBeNull();
		expect(safeReturnPath(null)).toBeNull();
	});
});
