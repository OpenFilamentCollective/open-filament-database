/**
 * /api/submissions/[pr]/revise: one revision of a PR at a time, so a double-click or a retry
 * can't open two replacement PRs for one returned PR.
 */
import { describe, it, expect, vi } from 'vitest';

const ctx = vi.hoisted(() => ({ release: () => {}, calls: 0 }));

vi.mock('$lib/server/submissionContext', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/submissionContext')>()),
	loadSubmissionContext: vi.fn(() => {
		ctx.calls++;
		// Hold the first request "in flight" until the test lets it go; it then fails access.
		return new Promise((resolve) => {
			ctx.release = () =>
				resolve({ access: { allowed: false, reason: 'nope', kind: 'bot', isMaintainer: false }, pr: {} });
		});
	})
}));
vi.mock('$lib/server/devFixtures', () => ({ previewFor: () => null }));
vi.mock('$lib/server/rateLimit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('$lib/server/cloudValidator', () => ({ runCloudValidation: vi.fn() }));
vi.mock('$lib/server/revision', () => ({ sanitizeNotes: () => [] }));
vi.mock('@sveltejs/kit', () => ({
	json: (data: any, init?: { status?: number }) => ({ status: init?.status ?? 200, body: data })
}));

import { POST } from '../submissions/[pr]/revise/+server';

function call() {
	return POST({
		params: { pr: '1000' },
		cookies: {},
		request: { json: async () => ({ changes: [{ entity: {} }] }) },
		getClientAddress: () => '127.0.0.1'
	} as any) as Promise<any>;
}

describe('POST /api/submissions/[pr]/revise', () => {
	it('refuses a second revision of the same PR while one is in flight', async () => {
		const first = call();
		await vi.waitFor(() => expect(ctx.calls).toBe(1));

		const second = await call();
		expect(second.status).toBe(409);
		expect(ctx.calls).toBe(1);

		ctx.release();
		expect((await first).status).toBe(403);
		// Released: the next attempt is processed again.
		const third = call();
		await vi.waitFor(() => expect(ctx.calls).toBe(2));
		ctx.release();
		await third;
	});
});
