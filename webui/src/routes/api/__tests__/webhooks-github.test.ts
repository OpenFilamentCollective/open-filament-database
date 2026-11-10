/**
 * Tests for the GitHub webhook receiver (/api/webhooks/github): merged, closed web-editor
 * PRs (classified later by closeOutcome.ts), reopened, and changes-requested reviews.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	verifyGitHubSignature: vi.fn(() => true),
	sendWebhook: vi.fn(async () => {}),
	getUuidByPrNumber: vi.fn((): string | undefined => undefined),
	getEmailByUuidFromDb: vi.fn(async (): Promise<string | undefined> => undefined),
	updateStatus: vi.fn(),
	sendMergedEmail: vi.fn(async () => {}),
	sendClosedEmail: vi.fn(async () => {}),
	sendChangesRequestedEmail: vi.fn(async () => {}),
	getInstallationToken: vi.fn(async () => 'app-token'),
	deleteBranch: vi.fn(async () => {}),
	handleWebEditorClose: vi.fn(async () => null),
	setOutcome: vi.fn(async () => ({})),
	getPrFeedback: vi.fn(async () => null),
	invalidateFeedback: vi.fn()
}));

vi.mock('$lib/server/webhooks', () => ({
	verifyGitHubSignature: mocks.verifyGitHubSignature,
	sendWebhook: mocks.sendWebhook
}));
vi.mock('$lib/server/submissionStore', () => ({
	getUuidByPrNumber: mocks.getUuidByPrNumber,
	getEmailByUuidFromDb: mocks.getEmailByUuidFromDb,
	updateStatus: mocks.updateStatus
}));
vi.mock('$lib/server/email', () => ({
	sendMergedEmail: mocks.sendMergedEmail,
	sendClosedEmail: mocks.sendClosedEmail,
	sendChangesRequestedEmail: mocks.sendChangesRequestedEmail
}));
vi.mock('$lib/server/githubApp', () => ({ getInstallationToken: mocks.getInstallationToken }));
vi.mock('$lib/server/github', () => ({ deleteBranch: mocks.deleteBranch }));
vi.mock('$lib/server/closeOutcome', () => ({ handleWebEditorClose: mocks.handleWebEditorClose }));
vi.mock('$lib/server/prOutcomes', () => ({ setOutcome: mocks.setOutcome }));
vi.mock('$lib/server/feedback', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/feedback')>()),
	getPrFeedback: mocks.getPrFeedback,
	invalidateFeedback: mocks.invalidateFeedback
}));
vi.mock('$lib/server/readToken', () => ({
	getReadToken: vi.fn(async () => 'app-token'),
	webuiUrl: () => 'https://editor.example',
	submissionUrl: (n: number) => `https://editor.example/submissions/${n}`
}));
vi.mock('@sveltejs/kit', () => ({
	json: (data: any, init?: { status?: number }) => ({ status: init?.status ?? 200, body: data })
}));

import { POST } from '../webhooks/github/+server';

const UUID = '4df9035c-eff0-4bfc-b4df-4c109ec197cc';

function call(event: string, payload: unknown): Promise<any> {
	const raw = JSON.stringify(payload);
	const request = {
		text: async () => raw,
		headers: { get: (name: string) => (name === 'x-github-event' ? event : 'sha256=x') }
	};
	return POST({ request } as any) as any;
}

function prPayload(
	action: string,
	pr: Record<string, unknown>,
	sender = { login: 'maintainer', type: 'User' }
) {
	return {
		action,
		sender,
		pull_request: {
			number: 827,
			html_url: 'https://github.com/o/r/pull/827',
			body: `<!-- ofd-submission-uuid: ${UUID} -->\nSubmitted`,
			merged: false,
			user: { login: 'ofd-anon-pr-bot', type: 'Bot' },
			head: { ref: `ofd-anon-${UUID}` },
			...pr
		}
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	for (const fn of Object.values(mocks)) fn.mockClear();
	mocks.verifyGitHubSignature.mockReturnValue(true);
});
afterEach(() => {
	vi.useRealTimers();
});

describe('POST /api/webhooks/github', () => {
	it('rejects a bad signature', async () => {
		mocks.verifyGitHubSignature.mockReturnValueOnce(false);
		const res = await call('pull_request', prPayload('closed', {}));
		expect(res.status).toBe(401);
	});

	it('a closed web-editor PR is classified after the settle delay', async () => {
		const res = await call('pull_request', prPayload('closed', {}));
		expect(res.body).toMatchObject({ classifying: true, uuid: UUID });
		// Nothing is decided (or emailed) until the closing comment has had time to land.
		expect(mocks.handleWebEditorClose).not.toHaveBeenCalled();
		expect(mocks.sendClosedEmail).not.toHaveBeenCalled();
		expect(mocks.updateStatus).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(5_000);
		expect(mocks.handleWebEditorClose).toHaveBeenCalledWith(
			{
				number: 827,
				html_url: 'https://github.com/o/r/pull/827',
				head_ref: `ofd-anon-${UUID}`,
				author: 'ofd-anon-pr-bot',
				authorIsBot: true
			},
			{ login: 'maintainer', isBot: false },
			UUID
		);
		// The bot's branch is still cleaned up; the PR's commits stay under refs/pull/<n>/head.
		expect(mocks.deleteBranch).toHaveBeenCalledWith(
			'app-token',
			'TestOwner',
			'test-repo',
			`ofd-anon-${UUID}`
		);
	});

	it('covers fork PRs without a UUID marker (#820)', async () => {
		await call(
			'pull_request',
			prPayload('closed', {
				number: 820,
				body: 'Updated colors',
				user: { login: 'contributor', type: 'User' },
				head: { ref: 'ofd-changes-1793377165446' }
			})
		);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(mocks.handleWebEditorClose).toHaveBeenCalledWith(
			expect.objectContaining({ number: 820, author: 'contributor', authorIsBot: false }),
			{ login: 'maintainer', isBot: false },
			null
		);
	});

	it('merged: status, webhook and email as before, no classification', async () => {
		mocks.getEmailByUuidFromDb.mockResolvedValueOnce('maker@example.com');
		const res = await call('pull_request', prPayload('closed', { merged: true }));
		expect(res.body).toMatchObject({ event: 'merged', uuid: UUID });
		expect(mocks.updateStatus).toHaveBeenCalledWith(UUID, 'merged');
		expect(mocks.sendWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'merged', uuid: UUID })
		);
		await vi.runAllTimersAsync();
		expect(mocks.sendMergedEmail).toHaveBeenCalledWith(
			'maker@example.com',
			827,
			'https://github.com/o/r/pull/827',
			'https://editor.example/submissions/827'
		);
		expect(mocks.handleWebEditorClose).not.toHaveBeenCalled();
	});

	it('ignores closes of PRs the web editor did not open', async () => {
		const res = await call(
			'pull_request',
			prPayload('closed', { body: 'manual', head: { ref: 'more_fields' } })
		);
		expect(res.body).toEqual({ ok: true });
		await vi.runAllTimersAsync();
		expect(mocks.handleWebEditorClose).not.toHaveBeenCalled();
	});

	it('reopened: back to open', async () => {
		const res = await call('pull_request', prPayload('reopened', {}));
		expect(res.body).toMatchObject({ event: 'reopened' });
		expect(mocks.updateStatus).toHaveBeenCalledWith(UUID, 'open');
		expect(mocks.setOutcome).toHaveBeenCalledWith({
			prNumber: 827,
			outcome: 'open',
			feedbackCount: 0
		});
	});

	it('changes requested: emails the review, every feedback item and the fix link', async () => {
		mocks.getEmailByUuidFromDb.mockResolvedValueOnce('maker@example.com');
		mocks.getPrFeedback.mockResolvedValueOnce({
			items: [
				{
					id: 'c1',
					kind: 'comment',
					source: 'maintainer',
					author: 'maintainer',
					body: 'Fix the name.',
					url: '',
					createdAt: '',
					outdated: false
				}
			]
		} as any);
		const { pull_request } = prPayload('submitted', {});
		const res = await call('pull_request_review', {
			action: 'submitted',
			review: { state: 'changes_requested', body: 'A few things' },
			pull_request
		});
		expect(res.body).toMatchObject({ event: 'changes_requested', uuid: UUID });
		expect(mocks.updateStatus).toHaveBeenCalledWith(UUID, 'changes_requested');
		await vi.runAllTimersAsync();
		expect(mocks.sendChangesRequestedEmail).toHaveBeenCalledWith(
			'maker@example.com',
			827,
			'https://github.com/o/r/pull/827',
			'A few things',
			[expect.objectContaining({ body: 'Fix the name.' })],
			'https://editor.example/submissions/827'
		);
	});
});
