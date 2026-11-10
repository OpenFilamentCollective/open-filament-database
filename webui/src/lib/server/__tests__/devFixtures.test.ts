/**
 * Development previews (devFixtures.ts): only on when this browser asked, never in
 * production, and always presented as a returned submission.
 */
import { describe, it, expect, vi } from 'vitest';
import {
	PREVIEW_COOKIE,
	enabledPreviews,
	previewChangesResponse,
	previewFeedbackResponse,
	previewFor,
	setPreview
} from '$lib/server/devFixtures';

function cookieJar(initial: Record<string, string> = {}) {
	const jar = { ...initial };
	return {
		jar,
		get: (name: string) => jar[name],
		set: vi.fn((name: string, value: string) => {
			jar[name] = value;
		}),
		delete: vi.fn((name: string) => {
			delete jar[name];
		})
	} as any;
}

describe('dev previews', () => {
	it('are off unless this browser turned them on', () => {
		expect(previewFor(cookieJar(), 827)).toBeNull();
		expect(previewFor(undefined, 827)).toBeNull();
		expect(previewFor(cookieJar({ [PREVIEW_COOKIE]: '827' }), 827)?.pr.number).toBe(827);
	});

	it('ignore PRs without a snapshot', () => {
		expect(enabledPreviews(cookieJar({ [PREVIEW_COOKIE]: '827,99999,abc' }))).toEqual([827]);
		expect(previewFor(cookieJar({ [PREVIEW_COOKIE]: '99999' }), 99999)).toBeNull();
	});

	it('toggle with a cookie', () => {
		const cookies = cookieJar();
		expect(setPreview(cookies, 827, true)).toEqual([827]);
		expect(cookies.jar[PREVIEW_COOKIE]).toBe('827');
		expect(setPreview(cookies, 827, false)).toEqual([]);
		expect(cookies.delete).toHaveBeenCalledWith(PREVIEW_COOKIE, { path: '/' });
	});

	it('present #827 as returned to its submitter, flagged as a preview', () => {
		const snapshot = previewFor(cookieJar({ [PREVIEW_COOKIE]: '827' }), 827)!;
		const feedback = previewFeedbackResponse(snapshot);
		expect(feedback).toMatchObject({
			status: 'returned',
			preview: true,
			pr: { number: 827, state: 'closed' },
			access: { allowed: true, as: 'submitter', mode: 'resubmit' }
		});
		expect(feedback.items.length).toBeGreaterThan(0);
		expect(feedback.items.every((i) => !i.body.includes('_(unverified'))).toBe(true);

		const changes = previewChangesResponse(snapshot);
		expect(changes.preview).toBe(true);
		expect(changes.changes.map((c) => [c.operation, c.entity.id])).toEqual([
			['create', 'glitter_pla'],
			['create', 'night_saphire']
		]);
	});

	it('never turn on outside development', async () => {
		vi.resetModules();
		vi.doMock('$app/environment', () => ({
			dev: false,
			browser: false,
			building: false,
			version: 'test'
		}));
		const prod = await import('$lib/server/devFixtures');
		const cookies = cookieJar({ [PREVIEW_COOKIE]: '827' });
		expect(prod.previewFor(cookies, 827)).toBeNull();
		expect(prod.previewSnapshot(827)).toBeNull();
		expect(prod.setPreview(cookies, 827, true)).toEqual([]);
		vi.doUnmock('$app/environment');
	});
});
