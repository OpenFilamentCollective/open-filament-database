/**
 * Revising a PR from the editor (revision.ts): who may, how the PR body is rewritten, and
 * what a push commits.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	getGitHubToken: vi.fn((): string | undefined => undefined),
	getGitHubUser: vi.fn(async () => ({ login: 'someone' })),
	getSimplyPrintToken: vi.fn((): string | undefined => undefined),
	getSimplyPrintUser: vi.fn(
		async (): Promise<{ email?: string }> => ({ email: 'maker@example.com' })
	),
	getRepoPermission: vi.fn(async () => 'read'),
	isAnonBotEnabled: vi.fn(() => true),
	// push
	getLatestCommitSha: vi.fn(async (_t: string, _o: string, _r: string, branch: string) =>
		branch === 'main' ? 'main-sha' : 'head-sha'
	),
	getCommitTreeSha: vi.fn(
		async (_t: string, _o: string, _r: string, sha: string) => `tree-of-${sha}`
	),
	getMergeBase: vi.fn(async () => 'old-main'),
	getPullRequestFiles: vi.fn(async (): Promise<any[]> => []),
	getRecursiveTree: vi.fn(async () => new Map<string, any>()),
	createTree: vi.fn(async () => 'new-tree'),
	createCommit: vi.fn(async () => 'new-commit'),
	updateRef: vi.fn(async () => {}),
	buildTreeItems: vi.fn(
		async (): Promise<any> => ({ treeItems: [], skippedPaths: [], noopDeletes: [] })
	),
	createReview: vi.fn(async () => {}),
	createIssueComment: vi.fn(async () => {}),
	getFileTextAtRef: vi.fn(
		async (
			_t: string,
			_o: string,
			_r: string,
			_path: string,
			_ref: string
		): Promise<string | null> => null
	)
}));

vi.mock('$lib/server/auth', () => ({
	getGitHubToken: mocks.getGitHubToken,
	getGitHubUser: mocks.getGitHubUser,
	getSimplyPrintToken: mocks.getSimplyPrintToken,
	getSimplyPrintUser: mocks.getSimplyPrintUser
}));
vi.mock('$lib/server/github', () => ({
	MERGE_PERMISSIONS: new Set(['admin', 'maintain', 'write']),
	getRepoPermission: mocks.getRepoPermission,
	getLatestCommitSha: mocks.getLatestCommitSha,
	getCommitTreeSha: mocks.getCommitTreeSha,
	getMergeBase: mocks.getMergeBase,
	getPullRequestFiles: mocks.getPullRequestFiles,
	getRecursiveTree: mocks.getRecursiveTree,
	createTree: mocks.createTree,
	createCommit: mocks.createCommit,
	updateRef: mocks.updateRef,
	updatePullRequest: vi.fn(),
	createIssueComment: mocks.createIssueComment,
	createReview: mocks.createReview,
	getFileTextAtRef: mocks.getFileTextAtRef
}));
vi.mock('$lib/server/prBuilder', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/prBuilder')>()),
	buildTreeItems: mocks.buildTreeItems
}));
vi.mock('$lib/server/anonBot', () => ({
	isAnonBotEnabled: mocks.isAnonBotEnabled,
	createAnonPR: vi.fn()
}));
vi.mock('$lib/server/forkPr', () => ({ createForkPR: vi.fn() }));
vi.mock('$lib/server/githubApp', () => ({ getInstallationToken: vi.fn(async () => 'app-token') }));

import {
	postFieldNotes,
	sanitizeNotes,
	checkReviseAccess,
	replaceChangesSection,
	pushRevision,
	RevisionConflictError
} from '$lib/server/revision';
import type { PullRequestDetails } from '$lib/server/github';

const cookies = {} as any;

function pr(overrides: Partial<PullRequestDetails> = {}): PullRequestDetails {
	return {
		number: 820,
		title: 'Update Filament Database',
		body: '<!-- ofd-submission-uuid: 00000000-0000-0000-0000-000000000000 -->\nDesc\n\n## Changes\n- [+] Old\n\n*Submitted by @contributor via the OFD web editor*',
		html_url: 'https://github.com/TestOwner/test-repo/pull/820',
		state: 'open',
		merged: false,
		draft: false,
		author: 'contributor',
		author_type: 'User',
		updated_at: '',
		closed_at: null,
		head_sha: 'head-sha',
		head_ref: 'ofd-changes-1',
		head_owner: 'contributor',
		head_repo: 'open-filament-database',
		base_ref: 'main',
		base_sha: 'x',
		maintainer_can_modify: true,
		...overrides
	};
}
const botPr = (o: Partial<PullRequestDetails> = {}) =>
	pr({
		head_ref: 'ofd-anon-x',
		author: 'ofd-anon-pr-bot',
		author_type: 'Bot',
		head_owner: 'TestOwner',
		head_repo: 'test-repo',
		...o
	});
const record = {
	uuid: 'u',
	prNumber: 827,
	prUrl: '',
	createdAt: '',
	status: 'open' as const,
	email: 'maker@example.com'
};

beforeEach(() => {
	for (const fn of Object.values(mocks)) fn.mockClear();
	mocks.getGitHubToken.mockReturnValue(undefined);
	mocks.getSimplyPrintToken.mockReturnValue(undefined);
	mocks.getRepoPermission.mockResolvedValue('read');
	mocks.isAnonBotEnabled.mockReturnValue(true);
});

function signInGitHub(login: string, permission = 'read') {
	mocks.getGitHubToken.mockReturnValue('gh-token');
	mocks.getGitHubUser.mockResolvedValue({ login });
	mocks.getRepoPermission.mockResolvedValue(permission);
}

describe('checkReviseAccess', () => {
	it('fork PR: its author amends with their own token', async () => {
		signInGitHub('Contributor');
		expect(await checkReviseAccess(cookies, pr(), undefined, undefined)).toMatchObject({
			allowed: true,
			as: 'submitter',
			via: 'user-token',
			mode: 'amend',
			kind: 'fork'
		});
	});

	it('bot PR: the SimplyPrint account that submitted it amends through the bot', async () => {
		mocks.getSimplyPrintToken.mockReturnValue('sp');
		expect(await checkReviseAccess(cookies, botPr(), record, undefined)).toMatchObject({
			allowed: true,
			as: 'submitter',
			via: 'bot',
			mode: 'amend'
		});
		mocks.getSimplyPrintUser.mockResolvedValueOnce({ email: 'other@example.com' });
		expect(await checkReviseAccess(cookies, botPr(), record, undefined)).toMatchObject({
			allowed: false,
			reason: expect.stringContaining('different SimplyPrint account')
		});
	});

	it('asks a signed-out visitor to sign in the right way', async () => {
		expect(await checkReviseAccess(cookies, botPr(), record, undefined)).toMatchObject({
			allowed: false,
			signIn: 'simplyprint'
		});
		expect(await checkReviseAccess(cookies, pr(), undefined, undefined)).toMatchObject({
			allowed: false,
			signIn: 'github'
		});
	});

	it('maintainers push to bot PRs via the bot and to forks that allow it', async () => {
		signInGitHub('maintainer', 'write');
		expect(await checkReviseAccess(cookies, botPr(), record, undefined)).toMatchObject({
			allowed: true,
			as: 'maintainer',
			via: 'bot'
		});
		expect(await checkReviseAccess(cookies, pr(), undefined, undefined)).toMatchObject({
			allowed: true,
			as: 'maintainer',
			via: 'user-token'
		});
		expect(
			await checkReviseAccess(cookies, pr({ maintainer_can_modify: false }), undefined, undefined)
		).toMatchObject({
			allowed: false,
			reason: expect.stringContaining('Allow edits by maintainers')
		});
		// A same-repo branch (a maintainer's own PR) is always pushable.
		expect(
			await checkReviseAccess(
				cookies,
				pr({ head_ref: 'more_fields', head_owner: 'TestOwner', maintainer_can_modify: false }),
				undefined,
				undefined
			)
		).toMatchObject({ allowed: true, kind: 'other' });
	});

	it('strangers are refused', async () => {
		signInGitHub('stranger');
		expect(await checkReviseAccess(cookies, pr(), undefined, undefined)).toMatchObject({
			allowed: false,
			reason: expect.stringContaining('@contributor')
		});
	});

	it('closed PRs: only a returned one can be resubmitted, by its submitter', async () => {
		signInGitHub('contributor');
		const closed = pr({ state: 'closed' });
		const returned = {
			prNumber: 820,
			outcome: 'returned' as const,
			feedbackCount: 2,
			updatedAt: ''
		};
		expect(await checkReviseAccess(cookies, closed, undefined, returned)).toMatchObject({
			allowed: true,
			mode: 'resubmit'
		});
		expect(
			await checkReviseAccess(cookies, closed, undefined, { ...returned, supersededBy: 900 })
		).toMatchObject({
			allowed: false,
			reason: expect.stringContaining('#900')
		});
		expect(
			await checkReviseAccess(cookies, closed, undefined, {
				...returned,
				outcome: 'rejected',
				reason: 'duplicate'
			})
		).toMatchObject({ allowed: false, reason: 'This submission was rejected: duplicate' });
		expect(await checkReviseAccess(cookies, closed, undefined, undefined)).toMatchObject({
			allowed: false
		});
		expect(
			await checkReviseAccess(cookies, pr({ merged: true, state: 'closed' }), undefined, undefined)
		).toMatchObject({
			allowed: false,
			reason: expect.stringContaining('merged')
		});

		signInGitHub('maintainer', 'write');
		expect(await checkReviseAccess(cookies, closed, undefined, returned)).toMatchObject({
			allowed: false,
			reason: expect.stringContaining('Reopen')
		});
	});
});

describe('replaceChangesSection', () => {
	const changes = [
		{ operation: 'create', description: 'Created variant "White"', entity: { path: 'x' } }
	];

	it('replaces only the list', () => {
		const body =
			'<!-- m -->\nMy description\n\n## Changes\n- [+] Old\n- [~] Older\n\n*Submitted by @c via the OFD web editor*';
		expect(replaceChangesSection(body, changes)).toBe(
			'<!-- m -->\nMy description\n\n## Changes\n- [+] Created variant "White"\n\n*Submitted by @c via the OFD web editor*'
		);
	});

	it('inserts a list before the footer when there is none', () => {
		expect(replaceChangesSection('Desc\n\n*Submitted via SimplyPrint*', changes)).toBe(
			'Desc\n\n## Changes\n- [+] Created variant "White"\n\n*Submitted via SimplyPrint*'
		);
	});
});

describe('pushRevision', () => {
	const changes = [
		{ operation: 'update', entity: { path: 'brands/sunlu' }, data: { id: 'sunlu' } }
	];

	it('refuses when the branch moved since the editor loaded it', async () => {
		await expect(
			pushRevision({ token: 't', pr: pr(), expectedHeadSha: 'stale', changes, message: 'm' })
		).rejects.toBeInstanceOf(RevisionConflictError);
		expect(mocks.createCommit).not.toHaveBeenCalled();
	});

	it('builds on main and merges main in when the branch is behind', async () => {
		mocks.buildTreeItems.mockResolvedValueOnce({
			treeItems: [{ path: 'data/sunlu/brand.json', sha: 'blob', mode: '100644', type: 'blob' }],
			skippedPaths: [],
			noopDeletes: []
		});
		mocks.getPullRequestFiles.mockResolvedValueOnce([
			{ filename: 'data/sunlu/brand.json', status: 'modified' },
			{ filename: 'data/sunlu/logo.png', status: 'modified' },
			{ filename: 'data/other/brand.json', status: 'added' },
			{ filename: 'docs/notes.md', status: 'added' }
		]);
		mocks.getRecursiveTree.mockResolvedValueOnce(
			new Map([
				['data/sunlu/logo.png', { sha: 'logo-blob', mode: '100644', type: 'blob' }],
				['docs/notes.md', { sha: 'doc-blob', mode: '100644', type: 'blob' }]
			])
		);

		const result = await pushRevision({
			token: 't',
			pr: pr(),
			expectedHeadSha: 'head-sha',
			changes,
			message: 'Revise #820'
		});

		expect(result).toMatchObject({ commitSha: 'new-commit', unchanged: false });
		// Blobs and the tree go to the head repo (the fork), on top of main's tree.
		expect(mocks.buildTreeItems).toHaveBeenCalledWith(
			't',
			'contributor',
			'open-filament-database',
			'tree-of-main-sha',
			'TestOwner',
			'test-repo',
			changes,
			undefined
		);
		const items = (mocks.createTree.mock.calls[0] as any[])[4] as any[];
		expect(items).toEqual(
			expect.arrayContaining([
				{ path: 'data/sunlu/brand.json', sha: 'blob', mode: '100644', type: 'blob' },
				// The logo stays: its brand is still in the submission.
				{ path: 'data/sunlu/logo.png', sha: 'logo-blob', mode: '100644', type: 'blob' },
				// A file the editor doesn't model is carried over.
				{ path: 'docs/notes.md', sha: 'doc-blob', mode: '100644', type: 'blob' }
			])
		);
		// The PR's other brand was dropped in the editor, so it simply isn't in main + changes.
		expect(items.find((i) => i.path === 'data/other/brand.json')).toBeUndefined();
		expect(mocks.createCommit).toHaveBeenCalledWith(
			't',
			'contributor',
			'open-filament-database',
			'Revise #820',
			'new-tree',
			['head-sha', 'main-sha']
		);
		expect(mocks.updateRef).toHaveBeenCalledWith(
			't',
			'contributor',
			'open-filament-database',
			'ofd-changes-1',
			'new-commit'
		);
	});

	it('commits with one parent when the branch already contains main', async () => {
		mocks.buildTreeItems.mockResolvedValueOnce({
			treeItems: [{ path: 'data/sunlu/brand.json', sha: 'blob', mode: '100644', type: 'blob' }],
			skippedPaths: [],
			noopDeletes: []
		});
		mocks.getMergeBase.mockResolvedValueOnce('main-sha');
		await pushRevision({
			token: 't',
			pr: pr(),
			expectedHeadSha: 'head-sha',
			changes,
			message: 'm'
		});
		expect((mocks.createCommit.mock.calls[0] as any[])[5]).toEqual(['head-sha']);
	});

	it('commits nothing when the result equals the branch', async () => {
		mocks.buildTreeItems.mockResolvedValueOnce({
			treeItems: [{ path: 'data/sunlu/brand.json', sha: 'blob', mode: '100644', type: 'blob' }],
			skippedPaths: [],
			noopDeletes: []
		});
		mocks.createTree.mockResolvedValueOnce('tree-of-head-sha');
		const result = await pushRevision({
			token: 't',
			pr: pr(),
			expectedHeadSha: 'head-sha',
			changes,
			message: 'm'
		});
		expect(result).toMatchObject({ unchanged: true, commitSha: null });
		expect(mocks.createCommit).not.toHaveBeenCalled();
	});
});

describe('postFieldNotes', () => {
	const VARIANT = 'brands/insignia/materials/PLA/filaments/glitter_pla/variants/night_saphire';
	const FILAMENT = 'brands/insignia/materials/PLA/filaments/glitter_pla';
	const files: Record<string, string> = {
		'data/insignia/PLA/glitter_pla/filament.json': JSON.stringify(
			{ id: 'glitter_pla', min_bed_temperature: 25 },
			null,
			2
		),
		'data/insignia/PLA/glitter_pla/night_saphire/sizes.json': JSON.stringify(
			[{ filament_weight: 1000, gtin: '1' }],
			null,
			2
		)
	};

	beforeEach(() => {
		mocks.getFileTextAtRef.mockImplementation(
			async (_t: string, _o: string, _r: string, path: string) => files[path] ?? null
		);
		mocks.createReview.mockReset();
		mocks.createIssueComment.mockReset();
	});

	it('comments on the line of each field, sizes in sizes.json, without pinging anyone', async () => {
		const result = await postFieldNotes({
			token: 't',
			prNumber: 827,
			commitSha: 'abc',
			notes: [
				{
					entityPath: FILAMENT,
					pointer: '/min_bed_temperature',
					text: 'The spool label says 25 °C, ask @someone'
				},
				{ entityPath: VARIANT, pointer: '/sizes/0/gtin', text: 'From the box' }
			]
		});
		expect(result).toBe('inline');
		const [, , , pr, sha, , comments] = mocks.createReview.mock.calls[0] as any[];
		expect([pr, sha]).toEqual([827, 'abc']);
		expect(comments).toEqual([
			{
				path: 'data/insignia/PLA/glitter_pla/filament.json',
				line: 3,
				body: expect.stringContaining('@\u200bsomeone')
			},
			{
				path: 'data/insignia/PLA/glitter_pla/night_saphire/sizes.json',
				line: 4,
				body: expect.stringContaining('From the box')
			}
		]);
	});

	it('falls back to one comment when a line is outside the diff', async () => {
		mocks.createReview.mockRejectedValueOnce(new Error('422 line must be part of the diff'));
		const result = await postFieldNotes({
			token: 't',
			prNumber: 827,
			commitSha: 'abc',
			notes: [{ entityPath: FILAMENT, pointer: '/min_bed_temperature', text: 'Label says so' }]
		});
		expect(result).toBe('comment');
		expect((mocks.createIssueComment.mock.calls[0] as any[])[4]).toContain(
			'**glitter pla · min bed temperature**: Label says so'
		);
	});

	it('also falls back when a field cannot be found, and does nothing without notes', async () => {
		const result = await postFieldNotes({
			token: 't',
			prNumber: 827,
			commitSha: 'abc',
			notes: [{ entityPath: FILAMENT, pointer: '/gone', text: 'x' }]
		});
		expect(result).toBe('comment');
		expect(mocks.createReview).not.toHaveBeenCalled();
		expect(await postFieldNotes({ token: 't', prNumber: 1, commitSha: 'a', notes: [] })).toBe(
			'none'
		);
	});

	it('sanitizes what the browser sends', () => {
		expect(
			sanitizeNotes([
				{ entityPath: 'a', pointer: '/x', text: '  hi  ' },
				{ entityPath: 'a', pointer: '/y', text: '   ' },
				{ nope: true },
				'junk'
			])
		).toEqual([{ entityPath: 'a', pointer: '/x', text: 'hi' }]);
		expect(sanitizeNotes('nope')).toEqual([]);
	});
});
