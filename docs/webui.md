# WebUI — Open Filament Database Editor

The WebUI is a SvelteKit web application for browsing and editing the Open Filament Database.  It runs in two modes — **local** (direct filesystem access) and **cloud** (remote API with change-tracking) — so contributors can edit data from a cloned repo or from the hosted instance.

---

## Table of Contents

- [Hosted Editor](#hosted-editor-no-setup)
- [Getting Started](#getting-started)
- [Application Modes](#application-modes)
- [Pages](#pages)
- [Features](#features)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Configuration](#configuration)

---

## Hosted Editor (No Setup)

Most contributors don't need to install anything. The hosted instance runs the WebUI in **cloud mode** and is available at:

👉 **<http://openfilamentdatabase.org/>**

Sign in with your GitHub account and any edits you make are tracked in your browser and submitted as a pull request when you're ready. Anonymous submissions are also supported when enabled — see [Cloud Mode](#cloud-mode-cloud) and [GitHub Integration](#github-integration) for details.

> The hosted URL is recorded under `[project.urls].WebUI` in [`pyproject.toml`](../pyproject.toml) and is the single source of truth — if it ever moves, that entry is updated first.

The rest of this document covers running the same editor locally, which is useful for offline work, contributing to the WebUI itself, or running the Python validator against a local clone.

---

## Getting Started

### Quick Start (Recommended for local development)

The easiest way to launch the WebUI locally is with the OFD wrapper script, which handles Python, Node.js, and dependency setup automatically.

**Linux / macOS:**

```bash
./ofd.sh webui
```

**Windows:**

```cmd
ofd.bat webui
```

On first run the wrapper will:

1. Check for Python 3.10+ and Node.js (offering to install if missing)
2. Create a Python virtual environment
3. Install all required dependencies
4. Start the SvelteKit dev server

Then open http://localhost:5173 and start editing.

### Command Options

```bash
./ofd.sh webui                  # Start on default port (5173)
./ofd.sh webui --port 3000      # Start on a custom port
./ofd.sh webui --host 0.0.0.0   # Bind to all interfaces (e.g. for LAN access)
./ofd.sh webui --open           # Open browser automatically
./ofd.sh webui --install        # Force reinstall npm dependencies
```

The same flags work with `ofd.bat` on Windows.

### Manual Setup

1. Install [Git, Python 3.10+, and Node.js](installing-software.md)
2. Enter the WebUI directory and install dependencies:

   ```bash
   cd webui
   npm ci
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Navigate to http://localhost:5173

---

## Application Modes

The WebUI supports two modes, controlled by the `PUBLIC_APP_MODE` environment variable.

### Local Mode (`local`)

- Reads and writes JSON files directly on the filesystem under `data/` and `stores/`.
- Save, sort, and validate operations invoke Python subprocesses.
- No authentication required — all operations are immediate.
- Intended for contributors who have cloned the repository locally.

### Cloud Mode (`cloud`)

- Fetches data from an external API (configured via `PUBLIC_API_BASE_URL`).
- Edits are tracked in the browser's `localStorage` as pending changes.
- Submitting changes creates a GitHub pull request (authenticated via OAuth) or an anonymous submission (via a bot account).
- In-process validation using AJV (no Python dependency).
- Designed for the hosted instance where users cannot write to the filesystem.

---

## Pages

### Home (`/`)

Entry point showing cards for **Brands**, **Stores**, **FAQ**, and **API** (if a base URL is configured).  Each card displays a count and links to the relevant section.

### Brands (`/brands`)

Grid of all brands with logos and names.  Includes a **Create Brand** button to add new brands.  Change indicators show which brands have pending edits.

### Brand Detail (`/brands/[brand]`)

Displays brand properties (name, origin, website, logo) with edit and delete controls.  Lists all materials under the brand with links to drill deeper.

### Material Detail (`/brands/[brand]/[material]`)

Shows the material type (PLA, ABS, PETG, etc.) and its properties.  Lists filaments under this material.

### Filament Detail (`/brands/[brand]/[material]/[filament]`)

Displays filament properties including slicer settings (temperatures, speeds, retraction).  Lists colour variants.

### Variant Detail (`/brands/[brand]/[material]/[filament]/[variant]`)

Leaf level of the hierarchy.  Shows variant-specific data: colour hex, name, sizes (weight, spool dimensions), purchase links with store references, certifications, and discontinued status.

### Stores (`/stores`)

Grid of all stores with logos.  Create / edit / delete support with change tracking.

### Store Detail (`/stores/[store]`)

Store properties: name, storefront URL, shipping regions.

### FAQ (`/faq`)

Categorised FAQ page covering: General, Local Mode, Cloud Mode, IDs, and Change Tracking.  Shows the current mode indicator.

---

## Features

### Data Hierarchy

The database is organised in layers:

```
Brand (e.g. Bambu Lab, eSUN, SUNLU)
└── Material (e.g. PLA, ABS, PETG)
    └── Filament (e.g. Sparkly, Basic)
        └── Variant (e.g. Black, Rainbow)
            └── Sizes & Purchase Links
```

Every entity above (including each spool under Sizes) has a stable, slug-independent **canonical `uuid`**. The WebUI never asks you to enter it and never generates one: new entries are submitted with an empty `uuid`, and CI assigns a permanent UUID when your pull request is merged. Editing an existing entry preserves its UUID unchanged. See [Canonical UUIDs](manual.md#-canonical-uuids--leave-them-empty) for details.

### Change Tracking

In cloud mode, all creates, updates, and deletes are recorded in `localStorage`:

- The **Changes Menu** (top-right badge) shows the number of pending changes.
- Individual changes can be undone or inspected.
- All changes can be exported as JSON or cleared.
- Changes persist across page reloads until submitted or cleared.

In local mode, changes are saved directly to disk — no tracking needed.

### Validation

- **Cloud mode**: In-process AJV validation against JSON schemas.  Validates entity structure, folder naming, image formats, GTIN checksums, and store-ID cross-references.
- **Local mode**: Invokes the Python `ofd validate` script as a subprocess with real-time SSE progress streaming.

Validation results show errors (red) and warnings (yellow) with paths linking to the offending entities.

### Data Sorting

Local mode only.  Runs `ofd script style_data` to alphabetically sort JSON keys for consistency.  Progress is streamed via SSE.

### Theme Switching

Light, dark, and system-follow themes via the header dropdown.  Preference is stored in `localStorage`.

### GitHub Integration

- **Authenticated PRs**: Users sign in via GitHub OAuth, and the editor forks the upstream repo, creates a branch, builds a commit from changes, and opens a pull request — all through the GitHub API.
- **SimplyPrint (bot) PRs**: When enabled, users sign in with SimplyPrint instead of GitHub and the submission bot (a GitHub App) opens the PR on their behalf. Submissions are tracked by UUID, and lifecycle events (submitted, merged, closed, changes requested, returned) fire webhooks and email the contributor.
- **Adding to an open submission**: submitting again over paths an open bot submission already covers offers to add to that PR instead of opening a competing one.

### Review feedback

Maintainers review web-editor PRs on GitHub as usual. The editor turns that review into something the contributor can act on without GitHub.

**What counts as feedback** (`src/lib/server/feedback.ts`):

- Every human comment on the PR: conversation comments, review bodies and inline review comments.
- The inline findings of the **latest** AI review run. Earlier runs and the AI summary comment don't count.
- Never: a comment starting with **"Note"** (any case, e.g. "Note to self:"), anything in a **resolved** thread, the PR author's own comments, slash commands, dismissed reviews, other bots.
- To drop a single item, resolve its thread on GitHub. A "Note" reply hides only itself, not the comment it replies to.

Inline comments are mapped to the entity and field they are about (e.g. *Night Saphire › name*), so the editor can show them on the right page.

**Closing a PR** (web-editor PRs only, i.e. branches `ofd-anon-*` and `ofd-changes-*`):

| How it was closed | Outcome | What happens |
|---|---|---|
| By a maintainer, after a comment starting with **"Reject"** (e.g. "Rejected: duplicate of #800") | `rejected` | A plain close. Bot-PR contributors get an email with the rest of that comment as the reason. |
| By a maintainer, with at least one feedback item and no "Reject" comment | `returned` | The feedback goes back to the contributor: by email for bot PRs, by an @mention in a "Returned for changes" comment for fork PRs. The comment also says whether a bot-PR contributor could be reached. |
| By the PR author, by a bot, or with no feedback | `closed` | A plain close, as before. |

**Fixing it** (`/submissions/[pr]`, linked from the email, the PR comment, the Changes menu and the AI review footer):

1. "Fix in the editor" loads the PR's changes into the editor, rebased onto current `main`, with a banner on every page it touches listing the feedback for that entity. Items whose field you have changed since loading are marked.
2. Submitting from the Changes menu then either pushes the fix onto the PR (still open) or opens a new PR replacing it (returned), linked both ways.

**Finding it again**: a **Submissions** link appears in the navbar once this browser has submitted anything, with a ⚠ when one needs changes (returned, or changes requested). It opens `/submissions`, the list of this browser's submissions. Emails link the submission page with a button.

**Trying it locally** (development only): open `/api/dev/preview/827` to see #827, from a snapshot in `src/lib/server/devFixtures/`, as a returned submission from its contributor's side: it adds the PR to this browser's submissions and opens its page, and from there everything (navbar warning, "Fix in the editor", the banners) is the normal flow. `?remove` undoes it; `?email=returned` (or `changes_requested`, `rejected`, `merged`, `closed`) shows the email it would send. It affects only your browser, needs no GitHub credentials, and can't be submitted or saved to disk.

**Who can revise**: the submitter (the same SimplyPrint account for bot PRs; the PR author's GitHub account for fork PRs) and maintainers (write access). Maintainers can push to bot PRs and to fork PRs that allow maintainer edits, and have a PR picker at `/review/prs`. A returned PR is for its contributor to resubmit; a maintainer who wants to fix it reopens it first.

### Logo Management

Brands and stores support logo uploads with client-side validation:

- Allowed formats: PNG, JPG, JPEG, SVG, GIF, WebP
- Maximum file size: 5 MB
- Logos are stored alongside the entity JSON in the data directory.

---

## Architecture

### Project Structure

```
webui/
├── src/
│   ├── routes/               # SvelteKit file-based routing
│   │   ├── +layout.svelte    # Global layout (header, nav, theme, changes menu)
│   │   ├── +page.svelte      # Home page
│   │   ├── brands/           # Brand hierarchy pages
│   │   ├── stores/           # Store pages
│   │   ├── faq/              # FAQ page
│   │   └── api/              # API endpoints (see API Reference)
│   ├── lib/
│   │   ├── components/       # Svelte components
│   │   │   ├── layout/       # ChangesMenu, DataDisplay
│   │   │   ├── forms/        # Entity form components
│   │   │   ├── form-fields/  # Reusable field components
│   │   │   ├── entity/       # EntityCard, EntityDetails, Logo
│   │   │   ├── ui/           # Button, Modal, LoadingSpinner, etc.
│   │   │   └── icons/        # SVG icon components
│   │   ├── services/         # Client-side services
│   │   │   ├── database.ts   # Main DB abstraction (local/cloud)
│   │   │   ├── entityService.ts
│   │   │   ├── schemaService.ts
│   │   │   └── imageStorage.ts
│   │   ├── server/           # Server-side modules
│   │   │   ├── auth.ts       # GitHub OAuth token management
│   │   │   ├── cloudValidator.ts   # In-process AJV validation
│   │   │   ├── cloudProxy.ts       # Cloud/local routing abstraction
│   │   │   ├── entityConfig.ts     # Entity type configurations
│   │   │   ├── entityCrud.ts       # Factory CRUD handler generators
│   │   │   ├── github.ts           # GitHub REST API client
│   │   │   ├── prBuilder.ts        # Shared PR-building logic
│   │   │   ├── anonBot.ts          # Anonymous submission bot
│   │   │   ├── rateLimit.ts        # IP-based sliding window rate limiter
│   │   │   ├── submissionStore.ts  # UUID-to-PR tracking (in-memory + file)
│   │   │   ├── webhooks.ts         # HMAC-signed webhook dispatch
│   │   │   ├── jobManager.ts       # Async job tracking
│   │   │   ├── saveUtils.ts        # Filesystem save utilities
│   │   │   ├── logoHandler.ts      # Logo file management
│   │   │   ├── imageValidation.ts  # Image format/size validation
│   │   │   └── pathValidation.ts   # Path traversal prevention
│   │   ├── stores/            # Svelte stores
│   │   │   ├── changes.ts    # Change tracking state
│   │   │   ├── auth.ts       # Authentication state
│   │   │   ├── environment.ts # Mode detection
│   │   │   └── theme.ts      # Theme preference
│   │   ├── types/
│   │   │   └── database.ts   # TypeScript type definitions
│   │   └── utils/             # Shared utilities
│   ├── hooks.server.ts        # Server startup & env validation
│   └── app.html               # HTML shell
├── svelte.config.js           # SvelteKit config (Node adapter for Docker)
├── vite.config.ts             # Vite + Tailwind CSS v4
├── .env.example               # Environment variable reference
└── package.json
```

### Key Technologies

- **SvelteKit** (Svelte 5) with TypeScript
- **Tailwind CSS v4** for styling
- **AJV** for JSON Schema validation (cloud mode)
- **SJSF** for dynamic form generation from schemas
- **Node.js** adapter for Docker deployment, auto adapter for development

---

## API Reference

All endpoints are served under `/api/`.  In cloud mode, entity-read endpoints proxy to the external API.  In local mode, they read from the filesystem.  Write endpoints (PUT, DELETE, POST for creates) operate on the local filesystem only — in cloud mode, changes are tracked client-side and submitted as pull requests.

### Authentication

#### POST `/api/auth/github/login`

Initiates the GitHub OAuth flow.  Generates a random state token stored in an httpOnly cookie (10-minute TTL) and redirects to GitHub's authorisation endpoint.

- **Scopes requested**: `public_repo workflow`
- **Response**: 302 redirect to GitHub

#### GET `/api/auth/github/callback`

OAuth callback handler.  Validates the state parameter against the cookie, exchanges the authorisation code for an access token, and stores the token in an httpOnly cookie (`ofd_gh_token`, 30-day TTL).

- **Query params**: `code`, `state`
- **Response**: 302 redirect to `/` with `auth_success=true` or `auth_error=<reason>`

#### POST `/api/auth/github/logout`

Clears the GitHub token cookie.

- **Response**: `{ "success": true }`

#### GET `/api/auth/github/status`

Returns the current authentication status.  If a token is present, fetches the GitHub user profile to verify it is still valid.

- **Response (authenticated)**:

  ```json
  { "authenticated": true, "user": { "login": "...", "name": "...", "avatar_url": "..." } }
  ```

- **Response (not authenticated)**:

  ```json
  { "authenticated": false }
  ```

---

### Brands

#### GET `/api/brands`

List all brands.

- **Response**: Array of brand objects.

#### GET `/api/brands/[id]`

Get a single brand by ID.

- **Response**: Brand object.

#### PUT `/api/brands/[id]`

Update a brand.  Local mode only.

- **Request body**: Brand JSON.
- **Response**: `{ "success": true }`

#### DELETE `/api/brands/[id]`

Delete a brand and all its children.  Local mode only.

- **Response**: `{ "success": true }`

#### POST `/api/brands/logo`

Upload a brand logo.

- **Request body**: `{ "brandId": "...", "imageData": "data:image/png;base64,..." }`
- **Response**: `{ "success": true, "path": "..." }`

#### DELETE `/api/brands/logo`

Delete a brand logo.

- **Request body**: `{ "brandId": "..." }`
- **Response**: `{ "success": true }`

#### GET `/api/brands/[id]/logo/[filename]`

Serve a brand's logo image file.

---

### Materials

#### GET `/api/brands/[brandId]/materials`

List all materials for a brand.

#### POST `/api/brands/[brandId]/materials`

Create a new material.  Local mode only.

- **Request body**: `{ "material": "PLA", ... }`
- **Response**: `{ "success": true, "material": { ... } }` (201)
- **Note**: The `material` field is used as the directory name (uppercased).

#### GET `/api/brands/[brandId]/materials/[materialType]`

Get a single material.

#### PUT `/api/brands/[brandId]/materials/[materialType]`

Update a material.  Local mode only.

#### DELETE `/api/brands/[brandId]/materials/[materialType]`

Delete a material and all its children.  Local mode only.

---

### Filaments

#### GET `/api/brands/[brandId]/materials/[materialType]/filaments`

List all filaments for a material.

#### POST `/api/brands/[brandId]/materials/[materialType]/filaments`

Create a new filament.  Local mode only.

- **Request body**: `{ "name": "Basic", ... }`
- **Response**: `{ "success": true, "filament": { ... } }` (201)

#### GET `/api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]`

Get a single filament.

#### PUT `/api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]`

Update a filament.  Local mode only.

#### DELETE `/api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]`

Delete a filament and all its children.  Local mode only.

---

### Variants

#### GET `/api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]/variants`

List all variants for a filament.  Sizes are merged from a separate `sizes.json` file.

#### POST `/api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]/variants`

Create a new variant.  Local mode only.

- **Request body**: `{ "name": "Black", "color_hex": "#000000", "sizes": [...], ... }`
- **Response**: `{ "success": true, "variant": { ... } }` (201)
- **Note**: `sizes` is extracted and written to a separate `sizes.json` file.

#### GET `/api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]/variants/[variantSlug]`

Get a single variant with sizes merged in.

#### PUT `/api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]/variants/[variantSlug]`

Update a variant.  Local mode only.

#### DELETE `/api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]/variants/[variantSlug]`

Delete a variant.  Local mode only.

---

### Stores

#### GET `/api/stores`

List all stores.

#### GET `/api/stores/[id]`

Get a single store.

#### PUT `/api/stores/[id]`

Update a store.  Local mode only.

#### DELETE `/api/stores/[id]`

Delete a store.  Local mode only.

#### POST `/api/stores/logo`

Upload a store logo.

- **Request body**: `{ "storeId": "...", "imageData": "data:image/png;base64,..." }`

#### DELETE `/api/stores/logo`

Delete a store logo.

- **Request body**: `{ "storeId": "..." }`

#### GET `/api/stores/[id]/logo/[filename]`

Serve a store's logo image file.

---

### Schemas

#### GET `/api/schemas/brand`

Returns the JSON schema for brand entities.

#### GET `/api/schemas/material`

Returns the JSON schema for material entities.

#### GET `/api/schemas/filament`

Returns the JSON schema for filament entities.

#### GET `/api/schemas/variant`

Returns the JSON schema for variant entities.

#### GET `/api/schemas/store`

Returns the JSON schema for store entities.

#### GET `/api/schemas/material_types`

Returns the list of valid material types.

---

### Validation

#### POST `/api/validate`

Start a validation job.

- **Request body**:

  ```json
  {
    "type": "full | json_files | logo_files | folder_names | store_ids",
    "changes": [...],
    "images": { ... },
    "sessionId": "uuid"
  }
  ```

- **Response**: `{ "jobId": "...", "sseUrl": "..." }`
- **Local mode**: Spawns Python subprocess (`python3 -m ofd validate`).
- **Cloud mode**: Runs in-process AJV validation.  `sessionId` is required.
- **Error 409**: A job is already running.

#### GET `/api/validate/status`

Check whether a validation job is currently running.

- **Query params**: `sessionId` (required in cloud mode)
- **Response**: `{ "running": true|false, "jobId": "...", "status": "..." }`

#### GET `/api/validate/stream/[jobId]`

SSE endpoint streaming validation progress events.

- **Content-Type**: `text/event-stream`
- **Events**: Progress updates, error reports, completion signal.

#### GET `/api/validate/result/[jobId]`

Retrieve the final validation result (fallback if SSE missed the completion event).

- **Response**: `{ "status": "...", "result": { ... } }`

---

### Sorting

#### POST `/api/sort`

Start a data sorting job.  Local mode only.

- **Request body**: `{ "dryRun": false, "runValidation": false }`
- **Response**: `{ "jobId": "...", "sseUrl": "..." }`
- **Error 403**: Not available in cloud mode.
- **Error 409**: Already running.

#### GET `/api/sort/stream/[jobId]`

SSE endpoint streaming sort progress events.  Local mode only.

---

### Save

#### POST `/api/save`

Batch-save all pending changes to the filesystem.  **Local mode only**.

- **Request body**:

  ```json
  {
    "changes": [
      {
        "entity": { "path": "brands/prusament" },
        "operation": "create | update | delete",
        "data": { ... }
      }
    ],
    "images": {
      "img-id": {
        "data": "base64...",
        "filename": "logo.png",
        "entityPath": "brands/prusament"
      }
    }
  }
  ```

- **Response** (success): `{ "success": true, "message": "...", "results": [...], "imageResults": [...], "styleData": {...}, "validation": {...} }`
- **Response** (partial): Same shape, HTTP 207.
- **Error 403**: Not available in cloud mode.
- **Behaviour**: Processes deletes first, then creates/updates.  Writes logo images.  Runs `style_data` for key sorting.  Runs validation.

---

### Pull Request Creation

#### POST `/api/github/create-pr`

Create a GitHub pull request from pending changes.  Requires GitHub OAuth authentication.

- **Request body**:

  ```json
  {
    "changes": [...],
    "images": { ... },
    "title": "Optional PR title",
    "description": "Optional PR description"
  }
  ```

- **Response**: `{ "success": true, "prUrl": "...", "prNumber": 123 }`
- **Error 401**: Not authenticated.
- **Behaviour**: Forks the upstream repo (idempotent), creates a timestamped branch, builds a Git tree from changes, creates a commit, and opens a PR.

---

### SimplyPrint (bot) submissions

#### POST `/api/anon/submit`

Submit changes through the submission bot (a GitHub App), for contributors without a GitHub account. Only available when `ANON_BOT_ENABLED=true`, and requires a SimplyPrint sign-in.

- **Request body**:

  ```json
  {
    "changes": [...],
    "images": { ... },
    "title": "Optional",
    "description": "Optional",
    "amendUuid": "Optional: add these changes to this open submission instead of opening a new PR"
  }
  ```

- **Response**: `{ "success": true, "uuid": "...", "prUrl": "...", "prNumber": 123, "amended": false }`
- **Error 401**: Not signed in with SimplyPrint, or the session expired.
- **Error 403**: `amendUuid` belongs to a different SimplyPrint account.
- **Error 422**: Validation errors found — includes `validation` object.
- **Error 429**: Rate limited — includes `Retry-After` header.
- **Rate limit**: Per-IP sliding window, default 5 submissions per hour.
- **Branch and body**: the bot pushes `ofd-anon-<uuid>` to upstream; the PR body starts with `<!-- ofd-submission-uuid: <uuid> -->`.
- **Privacy**: The SimplyPrint account's email is stored (Postgres `submissions` table) only to notify the contributor about their submission (merged, closed, changes requested, returned).

Fork PRs from `POST /api/github/create-pr` carry the same UUID marker and are tracked the same way (without an email).

---

### Submissions & review feedback

See [Review feedback](#review-feedback) for how these fit together.

#### GET `/api/submissions/[pr]`

A submission's status and its review feedback. Readable by anyone (the PR is public); the visitor's own permission to revise it is included.

- **Response**: `{ pr, status, outcome, items, truncated, access }`, where `status` is `open | feedback | merged | returned | rejected | closed`, `items` are feedback items (author, text, link, and for inline comments the entity path and JSON pointer they are about), and `access` says whether the visitor may revise it (`allowed`, `as: submitter | maintainer`, `mode: amend | resubmit`, or a `reason` and the `signIn` that would help).

#### GET `/api/submissions/[pr]/changes`

The PR's changes rebuilt as an editor change set, for loading into the editor. Only for visitors who may revise it.

- Read from the PR itself (its files at the head, the merge base and current `main`), so maintainer suggestion commits are included and untracked PRs work.
- Each entity is rebased onto current `main` with a 3-way JSON merge; when both sides changed a value, the PR wins and the field is listed in `conflicts`.
- **Response**: `{ prNumber, headSha, kind, changes, images, conflicts, otherFiles, feedback, access, ... }`

#### POST `/api/submissions/[pr]/revise`

Submit a revision from the editor.

- **Request body**: `{ changes, images, expectedHeadSha, title?, description? }`, where `changes` is the editor's whole change set for this PR.
- **Open PR**: commits `main` + the change set onto the PR's branch as a merge of the branch head and `main`, so the PR's diff equals the change set (anything dropped in the editor reverts). Files the editor doesn't model are carried over. **409** if the branch moved since `expectedHeadSha`.
- **Returned PR**: opens a new PR ("Resubmission of #N") and comments "Resubmitted as #M" on the old one.
- Pushes through the bot for bot PRs, and with the visitor's own GitHub token for fork PRs and maintainers.
- Validated like a first submission; rate-limited like `/api/anon/submit`.

#### POST `/api/submissions/status`

Reconcile the browser's submitted list against GitHub. Body `{ prNumbers }`; returns `{ statuses, mergedAt }` with `open | merged | closed | changes_requested | returned | rejected | unknown`.

#### GET `/api/review/prs`

The maintainer PR picker's list: open PRs plus PRs returned in the last 30 days, with feedback counts and whether the signed-in maintainer can push to each. Requires a GitHub sign-in with write access.

---

### Webhooks

#### POST `/api/webhooks/github`

Receives incoming GitHub webhook events for PR lifecycle tracking.

- **Headers**: `x-hub-signature-256` (HMAC-SHA256), `x-github-event`
- **Supported events**: `pull_request` (`closed`, `reopened`) and `pull_request_review` (`submitted` with state `changes_requested`)
- **Merged**: marks the submission merged, fires the `merged` webhook, emails the contributor.
- **Closed without merging (web-editor PRs)**: after `OFD_CLOSE_SETTLE_MS`, classifies the close as returned, rejected or closed (see [Review feedback](#review-feedback)), records it in `pr_outcomes`, emails bot-PR contributors, and posts the "Returned for changes" comment.
- **Changes requested**: marks the submission, fires the `changes_requested` webhook, and emails the contributor every open feedback item with the fix link.
- `ofd-anon-*` branches are deleted on close; the PR's commits stay reachable through `refs/pull/<n>/head`, which is what loading a returned PR reads.
- **Error 401**: Invalid signature.

---

## Configuration

All configuration is via environment variables.  See `.env.example` for the full reference.

### Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PUBLIC_APP_MODE` | Yes | — | `local` or `cloud` |
| `PUBLIC_API_BASE_URL` | Cloud mode | `https://api.openfilamentdatabase.org` | External API base URL |

### Caching (Cloud Mode)

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_CACHE_ENABLED` | `true` | Enable API response caching |
| `PUBLIC_CACHE_TTL_DEFAULT` | `300` | Default TTL in seconds |
| `PUBLIC_CACHE_TTL_SCHEMAS` | `86400` | Schema endpoint TTL (1 day) |
| `PUBLIC_CACHE_TTL_INDEX` | `300` | List endpoint TTL |
| `PUBLIC_CACHE_TTL_ENTITY` | `900` | Entity endpoint TTL |

### GitHub OAuth

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_GITHUB_CLIENT_ID` | For PRs | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | For PRs | GitHub OAuth App secret |
| `GITHUB_REDIRECT_URI` | For PRs | OAuth callback URL |
| `GITHUB_UPSTREAM_OWNER` | For PRs | Upstream repo owner (default: `OpenFilamentCollective`) |
| `GITHUB_UPSTREAM_REPO` | For PRs | Upstream repo name (default: `open-filament-database`) |

### Submission bot (GitHub App)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANON_BOT_ENABLED` | No | `false` | Enable SimplyPrint (bot) submissions |
| `GITHUB_APP_ID` | When enabled | — | The bot's GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | When enabled | — | The App's private key (PEM, `\n`-escaped) |
| `GITHUB_APP_INSTALLATION_ID` | When enabled | — | The App's installation on the upstream repo (Contents and Pull requests: read & write) |
| `DATABASE_URL` | Recommended | — | Postgres for submission records and PR outcomes; in-memory only without it |

### Webhooks

| Variable | Required | Description |
|----------|----------|-------------|
| `WEBHOOK_URL_SUBMITTED` | No | URL called when a bot PR is created |
| `WEBHOOK_URL_MERGED` | No | URL called when a PR is merged |
| `WEBHOOK_URL_CLOSED` | No | URL called when a PR is closed without merge (`reason` set when rejected) |
| `WEBHOOK_URL_CHANGES_REQUESTED` | No | URL called when changes are requested or a PR is returned for changes |
| `WEBHOOK_SECRET` | No | HMAC-SHA256 secret for signing outgoing webhook payloads |
| `GITHUB_WEBHOOK_SECRET` | When bot enabled | Secret for validating incoming GitHub webhook signatures |
| `OFD_CLOSE_SETTLE_MS` | No | Delay before classifying a close (default `5000`) |

### Review feedback

| Variable | Required | Description |
|----------|----------|-------------|
| `OFD_WEBUI_URL` | Recommended | Public URL of this editor, for "Fix it in the web editor" links in emails and PR comments. Same value as the `OFD_WEBUI_URL` repository variable the AI review uses. |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `ANON_RATE_LIMIT_PER_HOUR` | `5` | Maximum anonymous submissions per IP per hour |
