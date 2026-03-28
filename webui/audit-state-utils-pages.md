# State, Utils & Pages Audit

## Security Issues

| # | File | Line(s) | Issue | Fix |
|---|------|---------|-------|-----|
| 1 | `stores/environment.ts` | 17 | `FORCE_CLOUD_MODE` localStorage flag allows switching API endpoints | Remove or gate behind `DEV` check |
| 2 | `utils/imageProcessing.ts` | 258 | `processSvg()` processes untrusted SVG without element sanitization | Use DOMPurify or whitelist SVG elements |
| 3 | `stores/auth.ts` | 60 | Auth redirect preference stored in unencrypted localStorage | Use sessionStorage with expiration |

## Hardcoded Values

| # | File | Line(s) | Value | Fix |
|---|------|---------|-------|-----|
| 1 | `config/slicerConfig.ts` | 10 | `SLICER_KEYS = ['prusaslicer', 'bambustudio', 'orcaslicer', 'cura', 'generic']` | Load from schema/API |
| 2 | `types/changes.ts` | 6 | Entity types `'store'\|'brand'\|'material'\|'filament'\|'variant'` | Derive from schema config |
| 3 | `stores/changes.ts` | 31-32 | Storage keys `ofd_pending_changes`, `ofd_image_` prefix | Consolidate to `storageKeys.ts` |
| 4 | `utils/imageProcessing.ts` | 21-22 | `MIN_SIZE=100`, `MAX_SIZE=400` | Move to shared image config |
| 5 | `utils/api.ts` | 24-51 | API path regex patterns `/api/brands`, `/api/stores` | Extract to routing config |
| 6 | `config/traitConfig.ts` | 17-244 | ~80+ trait keys hardcoded | Load from backend schema endpoint |
| 7 | `utils/cache.ts` | 20-36 | TTL presets (1min, 5min, etc.) | Make configurable via env |
| 8 | `utils/messageHandler.svelte.ts` | 27 | `duration = 3000` (toast timeout) | Extract to UI config constants |
| 9 | Multiple stores | scattered | `ofd_theme`, `ofd_user_prefs`, `ofd_reopen_wizard` keys | Consolidate to `storageKeys.ts` |
| 10 | Multiple pages | scattered | Navigation paths `/brands`, `/stores` | Create routes config |

## Redundancies

| # | Pattern | Locations | Fix |
|---|---------|-----------|-----|
| 1 | Detail page init (state + messages + delete handler) | Every `[entity]/+page.svelte` | Create unified `createDetailPage()` composable |
| 2 | Schema processing sequence | `removeIdFromSchema` + `applyFormattedTitles` + `normalizeSchema` called individually | Always use `prepareSchemaForEdit()` wrapper |
| 3 | Logo upload validate → save → error pattern | `brands/+page.svelte:119-128`, store detail, other pages | Extract `handleLogoUpload()` utility |
| 4 | Search/filter derived store pattern | All list pages (`brands/+page.svelte:35-42`, stores, etc.) | Create `createSearchFilter()` composable |
| 5 | Modal state management (`showEditModal`, `showDeleteModal`) | All detail pages | Consolidate with entityState composable |
| 6 | Loading/error display pattern | Every page | Standardize via `DataDisplay` component |
| 7 | `collectDescendantChanges` and `hasDescendantChanges` | `changeTreeOps.ts:189-217` | Share single `walkDescendants()` helper |
| 8 | Change tracking subscription bridge (Svelte 4→5) | `changes.ts:146-161`, `entityState.svelte.ts:54-69` | Create Svelte 5 reactive wrapper |
