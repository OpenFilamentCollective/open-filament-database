/**
 * getCheckSummary: the merge page's view of a commit's checks.
 *
 * The merge gates (Brand sign-off, Sustainability sources) are commit statuses, not
 * check runs, and fail closed: pending, failed or missing all block.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCheckSummary, MERGE_GATES } from '../github';

function respond(checkRuns: unknown[], statuses: unknown[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			const body = url.includes('/check-runs') ? { check_runs: checkRuns } : { statuses };
			return new Response(JSON.stringify(body), { status: 200 });
		})
	);
}

const green = MERGE_GATES.map((context) => ({ context, state: 'success' }));

afterEach(() => vi.unstubAllGlobals());

describe('getCheckSummary', () => {
	it('counts check runs and statuses together', async () => {
		respond(
			[
				{ name: 'Validate data', status: 'completed', conclusion: 'success' },
				{ name: 'ruff', status: 'completed', conclusion: 'failure' },
				{ name: 'webui', status: 'in_progress', conclusion: null }
			],
			[...green, { context: 'ci/other', state: 'pending' }]
		);
		const summary = await getCheckSummary('t', 'o', 'r', 'sha');
		expect(summary.passed).toBe(1 + MERGE_GATES.length);
		expect(summary.failed).toEqual(['ruff']);
		expect(summary.pending).toEqual(['webui', 'ci/other']);
		expect(summary.blocking).toEqual([]);
	});

	it('blocks on a pending or failed gate', async () => {
		respond(
			[],
			[
				{ context: 'Brand sign-off', state: 'pending', description: 'Waiting for @rep' },
				{ context: 'Sustainability sources', state: 'failure', target_url: 'https://x' }
			]
		);
		const { blocking } = await getCheckSummary('t', 'o', 'r', 'sha');
		expect(blocking.map((b) => [b.context, b.state])).toEqual([
			['Brand sign-off', 'pending'],
			['Sustainability sources', 'failure']
		]);
		expect(blocking[0].description).toBe('Waiting for @rep');
	});

	it('blocks on a gate that was never posted', async () => {
		respond([], [{ context: 'Brand sign-off', state: 'success' }]);
		const { blocking } = await getCheckSummary('t', 'o', 'r', 'sha');
		expect(blocking).toEqual([
			expect.objectContaining({ context: 'Sustainability sources', state: 'missing' })
		]);
	});
});
