/**
 * The upstream API is rebuilt by a single nightly cron, so "merged" and "visible to the
 * webui" are up to ~24 h apart. `datasetVisibleAfter` is what lets the submitted overlay
 * bridge that gap instead of dropping a contributor's work the moment their PR merges.
 */
import { describe, it, expect } from 'vitest';
import {
	datasetVisibleAfter,
	BUILD_CRON_UTC_HOUR,
	BUILD_CRON_UTC_MINUTE,
	BUILD_PROPAGATION_GRACE_MS
} from '../datasetSchedule';

/** The cron time on a given UTC date, plus the propagation grace. */
function expected(iso: string): number {
	const d = new Date(iso);
	d.setUTCHours(BUILD_CRON_UTC_HOUR, BUILD_CRON_UTC_MINUTE, 0, 0);
	return d.getTime() + BUILD_PROPAGATION_GRACE_MS;
}

describe('datasetVisibleAfter', () => {
	it('waits for tonight’s build when the merge is earlier in the day', () => {
		// PR #459 merged 2026-08-19T13:48:57Z -> published by the 22:15Z build the same day.
		expect(datasetVisibleAfter('2026-08-19T13:48:57Z').getTime()).toBe(
			expected('2026-08-19T00:00:00Z')
		);
	});

	it('waits for the next day when the merge lands after the cron', () => {
		expect(datasetVisibleAfter('2026-08-19T23:00:00Z').getTime()).toBe(
			expected('2026-08-20T00:00:00Z')
		);
	});

	it('treats a merge exactly at cron time as missing that run', () => {
		// The build reads the tree when it starts; a merge at that instant may not be in it.
		expect(datasetVisibleAfter('2026-08-19T22:15:00Z').getTime()).toBe(
			expected('2026-08-20T00:00:00Z')
		);
	});

	it('rolls over month and year boundaries', () => {
		expect(datasetVisibleAfter('2026-12-31T23:30:00Z').getTime()).toBe(
			expected('2027-01-01T00:00:00Z')
		);
	});

	it('accepts a Date or an epoch as well as an ISO string', () => {
		const iso = '2026-08-19T13:48:57Z';
		const fromIso = datasetVisibleAfter(iso).getTime();
		expect(datasetVisibleAfter(new Date(iso)).getTime()).toBe(fromIso);
		expect(datasetVisibleAfter(new Date(iso).getTime()).getTime()).toBe(fromIso);
	});

	it('always lands strictly after the merge', () => {
		for (const hour of [0, 6, 12, 22, 23]) {
			const merged = `2026-08-19T${String(hour).padStart(2, '0')}:20:00Z`;
			expect(datasetVisibleAfter(merged).getTime()).toBeGreaterThan(new Date(merged).getTime());
		}
	});
});
