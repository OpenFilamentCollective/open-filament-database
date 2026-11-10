/**
 * Closing a web-editor PR (closeOutcome.ts): returned, rejected or closed, and who hears.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	getPrFeedback: vi.fn(),
	setOutcome: vi.fn(async (o: any) => ({ ...o, updatedAt: 'now' })),
	updateStatus: vi.fn(),
	getEmailByUuidFromDb: vi.fn(async (): Promise<string | undefined> => undefined),
	sendReturnedEmail: vi.fn(async () => {}),
	sendRejectedEmail: vi.fn(async () => {}),
	sendClosedEmail: vi.fn(async () => {}),
	sendWebhook: vi.fn(async () => {}),
	upsertMarkedComment: vi.fn(async () => {}),
	getReadToken: vi.fn(async (): Promise<string | null> => 'app-token')
}));

vi.mock('$lib/server/feedback', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/feedback')>()),
	getPrFeedback: mocks.getPrFeedback,
	invalidateFeedback: vi.fn()
}));
vi.mock('$lib/server/prOutcomes', () => ({ setOutcome: mocks.setOutcome }));
vi.mock('$lib/server/submissionStore', () => ({
	updateStatus: mocks.updateStatus,
	getEmailByUuidFromDb: mocks.getEmailByUuidFromDb
}));
vi.mock('$lib/server/email', () => ({
	sendReturnedEmail: mocks.sendReturnedEmail,
	sendRejectedEmail: mocks.sendRejectedEmail,
	sendClosedEmail: mocks.sendClosedEmail
}));
vi.mock('$lib/server/webhooks', () => ({ sendWebhook: mocks.sendWebhook }));
vi.mock('$lib/server/github', () => ({ upsertMarkedComment: mocks.upsertMarkedComment }));
vi.mock('$lib/server/readToken', () => ({
	getReadToken: mocks.getReadToken,
	webuiUrl: () => 'https://editor.example',
	submissionUrl: (n: number) => `https://editor.example/submissions/${n}`
}));
vi.mock('$env/dynamic/private', () => ({
	env: { GITHUB_UPSTREAM_OWNER: 'o', GITHUB_UPSTREAM_REPO: 'r', GITHUB_APP_ID: '1' }
}));

import {
	classifyClose,
	handleWebEditorClose,
	returnedComment,
	FEEDBACK_MARKER
} from '$lib/server/closeOutcome';

const item = {
	id: 't1',
	kind: 'inline',
	source: 'ai',
	author: 'github-actions',
	body: 'Misspelled.',
	url: '',
	createdAt: '',
	outdated: false
};

describe('classifyClose', () => {
	const base = {
		prAuthor: 'contributor',
		prAuthorIsBot: false,
		closedBy: 'maintainer',
		closedByIsBot: false
	};

	it('returns a PR with feedback and no reject comment', () => {
		expect(
			classifyClose({ ...base, feedback: { items: [item as any], rejectComment: null } })
		).toEqual({ outcome: 'returned' });
	});

	it('rejects when a maintainer wrote "Reject…"', () => {
		expect(
			classifyClose({
				...base,
				feedback: {
					items: [item as any],
					rejectComment: { author: 'maintainer', reason: 'duplicate', createdAt: '', url: '' }
				}
			})
		).toEqual({ outcome: 'rejected', reason: 'duplicate' });
	});

	it('is a plain close with nothing to fix, by the author, or by a bot', () => {
		expect(classifyClose({ ...base, feedback: { items: [], rejectComment: null } })).toEqual({
			outcome: 'closed'
		});
		expect(
			classifyClose({
				...base,
				closedBy: 'Contributor',
				feedback: { items: [item as any], rejectComment: null }
			})
		).toEqual({ outcome: 'closed' });
		expect(
			classifyClose({
				...base,
				closedByIsBot: true,
				feedback: { items: [item as any], rejectComment: null }
			})
		).toEqual({ outcome: 'closed' });
	});

	it("doesn't mistake a maintainer for the bot author of a bot PR", () => {
		expect(
			classifyClose({
				...base,
				prAuthor: 'ofd-anon-pr-bot',
				prAuthorIsBot: true,
				feedback: { items: [item as any], rejectComment: null }
			})
		).toEqual({ outcome: 'returned' });
	});
});

describe('returnedComment', () => {
	it('mentions a fork author and links the editor', () => {
		const body = returnedComment({
			kind: 'fork',
			author: 'contributor',
			itemCount: 7,
			prNumber: 820,
			emailed: false
		});
		expect(body.startsWith(FEEDBACK_MARKER)).toBe(true);
		expect(body).toContain('@contributor');
		expect(body).toContain('7 items of feedback');
		expect(body).toContain('(https://editor.example/submissions/820)');
	});

	it('says whether a bot submitter could be reached', () => {
		expect(
			returnedComment({
				kind: 'bot',
				author: 'ofd-anon-pr-bot',
				itemCount: 1,
				prNumber: 827,
				emailed: true
			})
		).toContain('notified by email');
		const unreachable = returnedComment({
			kind: 'bot',
			author: 'ofd-anon-pr-bot',
			itemCount: 1,
			prNumber: 827,
			emailed: false
		});
		expect(unreachable).toContain('No email is on file');
		expect(unreachable).not.toContain('@ofd-anon-pr-bot');
	});
});

describe('handleWebEditorClose', () => {
	const botPr = {
		number: 827,
		html_url: 'https://github.com/o/r/pull/827',
		head_ref: 'ofd-anon-x',
		author: 'ofd-anon-pr-bot',
		authorIsBot: true
	};
	const forkPr = {
		number: 820,
		html_url: 'https://github.com/o/r/pull/820',
		head_ref: 'ofd-changes-1',
		author: 'contributor',
		authorIsBot: false
	};
	const maintainer = { login: 'maintainer', isBot: false };

	beforeEach(() => {
		for (const fn of Object.values(mocks)) fn.mockClear();
		mocks.getReadToken.mockResolvedValue('app-token');
		mocks.getEmailByUuidFromDb.mockResolvedValue(undefined);
	});

	it('returned bot PR: records it, emails the feedback, posts the sticky comment', async () => {
		mocks.getPrFeedback.mockResolvedValue({ items: [item], rejectComment: null });
		mocks.getEmailByUuidFromDb.mockResolvedValue('maker@example.com');

		const outcome = await handleWebEditorClose(botPr, maintainer, 'uuid-827');

		expect(outcome).toMatchObject({
			outcome: 'returned',
			feedbackCount: 1,
			notified: 'email',
			closedBy: 'maintainer'
		});
		expect(mocks.updateStatus).toHaveBeenCalledWith('uuid-827', 'returned');
		expect(mocks.sendReturnedEmail).toHaveBeenCalledWith(
			'maker@example.com',
			827,
			botPr.html_url,
			[item],
			'https://editor.example/submissions/827'
		);
		expect(mocks.sendWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'changes_requested', uuid: 'uuid-827' })
		);
		expect(mocks.upsertMarkedComment).toHaveBeenCalledWith(
			'app-token',
			'o',
			'r',
			827,
			FEEDBACK_MARKER,
			expect.stringContaining('notified by email')
		);
	});

	it('rejected: emails the reason, no sticky comment', async () => {
		mocks.getPrFeedback.mockResolvedValue({
			items: [item],
			rejectComment: { author: 'maintainer', reason: 'not a real product', createdAt: '', url: '' }
		});
		mocks.getEmailByUuidFromDb.mockResolvedValue('maker@example.com');

		const outcome = await handleWebEditorClose(botPr, maintainer, 'uuid-827');

		expect(outcome).toMatchObject({
			outcome: 'rejected',
			reason: 'not a real product',
			feedbackCount: 0
		});
		expect(mocks.sendRejectedEmail).toHaveBeenCalledWith(
			'maker@example.com',
			827,
			botPr.html_url,
			'not a real product',
			'https://editor.example/submissions/827'
		);
		expect(mocks.sendWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'closed', reason: 'not a real product' })
		);
		expect(mocks.upsertMarkedComment).not.toHaveBeenCalled();
	});

	it('returned fork PR: notified by mention, no email', async () => {
		mocks.getPrFeedback.mockResolvedValue({ items: [item, item], rejectComment: null });

		const outcome = await handleWebEditorClose(forkPr, maintainer, null);

		expect(outcome).toMatchObject({ outcome: 'returned', notified: 'mention', feedbackCount: 2 });
		expect(mocks.sendReturnedEmail).not.toHaveBeenCalled();
		expect(mocks.sendWebhook).not.toHaveBeenCalled();
		expect(mocks.upsertMarkedComment).toHaveBeenCalledWith(
			'app-token',
			'o',
			'r',
			820,
			FEEDBACK_MARKER,
			expect.stringContaining('@contributor')
		);
	});

	it('author withdrew it: a plain close with the old closed email', async () => {
		mocks.getPrFeedback.mockResolvedValue({ items: [item], rejectComment: null });
		mocks.getEmailByUuidFromDb.mockResolvedValue('maker@example.com');

		const outcome = await handleWebEditorClose(
			forkPr,
			{ login: 'contributor', isBot: false },
			'uuid-820'
		);
		expect(outcome).toMatchObject({ outcome: 'closed' });
		expect(mocks.sendClosedEmail).toHaveBeenCalled();
		expect(mocks.upsertMarkedComment).not.toHaveBeenCalled();
	});

	it('ignores PRs the web editor did not open', async () => {
		expect(
			await handleWebEditorClose({ ...forkPr, head_ref: 'my-branch' }, maintainer, null)
		).toBeNull();
		expect(mocks.setOutcome).not.toHaveBeenCalled();
	});

	it('without a token it can only record a plain close', async () => {
		mocks.getReadToken.mockResolvedValue(null);
		const outcome = await handleWebEditorClose(forkPr, maintainer, null);
		expect(outcome).toMatchObject({ outcome: 'closed' });
		expect(mocks.getPrFeedback).not.toHaveBeenCalled();
	});
});
