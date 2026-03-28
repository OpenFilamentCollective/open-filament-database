# Server & API Audit

## Security Issues

| # | File | Line(s) | Issue | Fix |
|---|------|---------|-------|-----|
| 1 | `lib/server/auth.ts` | 84 | Hardcoded fallback to `simplyprint.io` if env var missing — silently hits production | Fail explicitly when `SIMPLYPRINT_BASE_URL` not set |
| 2 | `lib/server/webhooks.ts` | 106-117 | Missing `GITHUB_WEBHOOK_SECRET` silently accepts unverified webhooks | Throw on startup if secret not set in production |
| 3 | `lib/server/email.ts` | 96 | Review comments injected into HTML body with only `\n→<br>` escaping | Use proper HTML sanitization library |
| 4 | `lib/server/db.ts` | 21 | `rejectUnauthorized: false` by default — disables SSL cert validation | Default to `true`; make configurable |
| 5 | `lib/server/logoHandler.ts` | 34 | Weak regex `\w+` for MIME type in data URL — allows unexpected types | Validate against `ALLOWED_IMAGE_EXTENSIONS` whitelist |
| 6 | `lib/server/pathValidation.ts` | 15 | `basename()` check doesn't catch encoded traversal variants | Add character whitelist validation |
| 7 | `lib/server/cloudValidator.ts` | 90-91 | `fetch()` without timeout — can hang indefinitely | Add `AbortSignal.timeout()` |
| 8 | `lib/server/rateLimit.ts` | 15 | `parseInt` can return NaN silently | Validate parsed number is positive integer |
| 9 | `routes/api/save/+server.ts` | 174 | Base64 buffer decoded before size limit check | Validate base64 string length before `Buffer.from()` |
| 10 | `lib/server/auth.ts` | 93 | 1-hour SP token with no refresh logic | Implement token refresh or document limitation |

## Hardcoded Values

| # | File | Line(s) | Value | Fix |
|---|------|---------|-------|-----|
| 1 | `lib/server/cloudProxy.ts` | 11 | `https://api.openfilamentdatabase.org` | Require explicit `PUBLIC_API_BASE_URL` |
| 2 | `lib/server/auth.ts` | 10-11 | Cookie names `ofd_gh_token`, `ofd_sp_token` | Move to shared constants file |
| 3 | `lib/server/imageValidation.ts` | 25-26 | `LOGO_MIN_SIZE=100`, `LOGO_MAX_SIZE=400` | Move to centralized config |
| 4 | `lib/server/logoHandler.ts` | 6 | `MAX_LOGO_SIZE_BYTES = 5MB` | Use shared constant from config |
| 5 | `lib/server/rateLimit.ts` | 12 | `WINDOW_MS = 1 hour` | Read from env var |
| 6 | `lib/server/jobManager.ts` | 20, 75 | Stale lock 35min, job timeout 30min | Move to config/env vars |
| 7 | `lib/server/cloudValidator.ts` | 42 | `SCHEMA_TTL_MS`, `STORE_IDS_TTL_MS` = 30min | Make configurable via env |
| 8 | `routes/api/save/+server.ts` | 10-11 | `MAX_IMAGE_SIZE_BYTES`, `ALLOWED_IMAGE_EXTENSIONS` | Use shared source of truth |
| 9 | `lib/server/auth.ts` | 84-86 | SP API URL pattern construction | Require explicit env vars |

## Redundancies

| # | Pattern | Locations | Fix |
|---|---------|-----------|-----|
| 1 | Image size/format validation | `logoHandler.ts`, `imageValidation.ts`, `save/+server.ts` | Create single `imageConfig.ts` |
| 2 | Path validation/sanitization | `pathValidation.ts`, `entityConfig.ts:82-105`, `saveUtils.ts:13` | Consolidate into `pathValidation.ts` |
| 3 | Entity path resolution | `entityCrud.ts:19-34`, `saveUtils.ts:47-79`, `prBuilder.ts:21-56` | Create `pathMapping.ts` |
| 4 | Base64 data URL parsing | `logoHandler.ts:33-40`, `imageStorage.ts:120-131` | Shared utility function |
| 5 | GitHub API wrappers | `github.ts`, `githubApp.ts` | Create base `githubClient.ts` |
| 6 | Schema fetching | `cloudValidator.ts:44-63`, `prBuilder.ts:114-150`, `schemaHandler.ts:17-20` | Create `schemaLoader.ts` service |
| 7 | Env var access for API base | `cloudProxy.ts`, `saveUtils.ts` | Centralize in `config.ts` |
