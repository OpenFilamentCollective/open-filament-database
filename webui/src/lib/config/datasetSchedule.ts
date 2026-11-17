/**
 * When upstream data a contributor submitted actually becomes visible to the webui.
 *
 * In cloud mode the webui reads `api.openfilamentdatabase.org`, which is rebuilt by
 * `.github/workflows/build-dataset.yml` on a single nightly cron (`15 22 * * *`, UTC).
 * So a merged PR is *not* reflected upstream at merge time — it lands at the next nightly
 * build, up to ~24 h later.
 *
 * The submitted-changes overlay (`$lib/stores/submitted.ts`) has to cover exactly that
 * window: dropping an entry when its PR merges makes the contributor's own work vanish from
 * their view, which is what caused duplicate submissions #442 (re-submitting #433's variants)
 * and #460 (re-creating a filament #459 had already added).
 *
 * Keep `BUILD_CRON_UTC_HOUR`/`_MINUTE` in sync with the workflow's cron expression.
 */

/** Hour (UTC) of the nightly `build-dataset` cron. */
export const BUILD_CRON_UTC_HOUR = 22;
/** Minute (UTC) of the nightly `build-dataset` cron. */
export const BUILD_CRON_UTC_MINUTE = 15;

/**
 * Slack after the cron fires before the rebuilt dataset is actually served: the build,
 * the Pages deploy and CDN propagation. Deliberately generous — over-estimating keeps a
 * correct entry in the overlay a little too long, while under-estimating re-opens the
 * disappearing-work bug this whole mechanism exists to prevent.
 */
export const BUILD_PROPAGATION_GRACE_MS = 90 * 60 * 1000;

/**
 * The moment a change merged at `mergedAt` can be expected to appear in the upstream API:
 * the first nightly build strictly after the merge, plus propagation grace.
 */
export function datasetVisibleAfter(mergedAt: Date | string | number): Date {
	const merged = new Date(mergedAt);
	const build = new Date(merged);
	build.setUTCHours(BUILD_CRON_UTC_HOUR, BUILD_CRON_UTC_MINUTE, 0, 0);
	// A merge at or after tonight's cron time waits for tomorrow's run.
	if (build.getTime() <= merged.getTime()) build.setUTCDate(build.getUTCDate() + 1);
	return new Date(build.getTime() + BUILD_PROPAGATION_GRACE_MS);
}
