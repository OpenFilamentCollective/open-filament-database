# WebUI — Open Filament Database Editor

The WebUI is a SvelteKit web application for browsing and editing the Open Filament Database.  It runs in two modes — **local** (direct filesystem access) and **cloud** (remote API with change-tracking) — so contributors can edit data from a cloned repo or from the hosted instance at openfilamentdatabase.org.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Application Modes](#application-modes)
- [Pages](#pages)
- [Features](#features)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Configuration](#configuration)

---

## Getting Started

### Quick Start (Recommended)

The easiest way to launch the WebUI is with the OFD wrapper script, which handles Python, Node.js, and dependency setup automatically.

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
./ofd.sh webui              # Default port 5173
./ofd.sh webui --port 3000  # Custom port
./ofd.sh webui --open       # Open browser automatically
./ofd.sh webui --install    # Force reinstall npm dependencies
```

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
- **Anonymous PRs**: When enabled, users can submit changes without a GitHub account.  A bot account creates the PR on their behalf.  Submissions are tracked by UUID, and lifecycle events (submitted, merged, closed) fire webhooks.

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

### Anonymous Submissions

#### POST `/api/anon/submit`

Submit changes anonymously via a bot account.  Only available when the anonymous bot feature is enabled.

- **Request body**:

  ```json
  {
    "changes": [...],
    "images": { ... },
    "title": "Optional",
    "description": "Optional",
    "email": "Optional, never stored"
  }
  ```

- **Response**: `{ "success": true, "uuid": "...", "prUrl": "...", "prNumber": 123 }`
- **Error 422**: Validation errors found — includes `validation` object.
- **Error 429**: Rate limited — includes `Retry-After` header.
- **Rate limit**: Per-IP sliding window, default 5 submissions per hour.
- **Privacy**: Email is only forwarded in the outgoing webhook and is never persisted.

#### GET `/api/anon/status/[uuid]`

Check the status of an anonymous submission.

- **Response**:

  ```json
  {
    "uuid": "...",
    "status": "open | merged | closed",
    "prUrl": "...",
    "prNumber": 123,
    "createdAt": "2025-01-15T10:30:00Z"
  }
  ```

- **Error 404**: Feature disabled or submission not found.

---

### Webhooks

#### POST `/api/webhooks/github`

Receives incoming GitHub webhook events for PR lifecycle tracking.

- **Headers**: `x-hub-signature-256` (HMAC-SHA256), `x-github-event`
- **Supported events**: `pull_request` with action `closed`
- **Behaviour**: Verifies the signature, extracts the submission UUID from the PR body, updates the submission status to `merged` or `closed`, and fires outgoing webhooks.
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

### Anonymous Bot

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PUBLIC_ANON_BOT_ENABLED` | No | `false` | Enable anonymous submissions (client flag) |
| `ANON_BOT_ENABLED` | No | `false` | Enable anonymous submissions (server flag) |
| `ANON_BOT_GITHUB_PAT` | When enabled | — | Bot account personal access token (`public_repo` scope) |
| `ANON_BOT_GITHUB_USERNAME` | When enabled | — | Bot GitHub username |

### Webhooks

| Variable | Required | Description |
|----------|----------|-------------|
| `WEBHOOK_URL_SUBMITTED` | No | URL called when an anonymous PR is created |
| `WEBHOOK_URL_MERGED` | No | URL called when a PR is merged |
| `WEBHOOK_URL_CLOSED` | No | URL called when a PR is closed without merge |
| `WEBHOOK_SECRET` | No | HMAC-SHA256 secret for signing outgoing webhook payloads |
| `GITHUB_WEBHOOK_SECRET` | When bot enabled | Secret for validating incoming GitHub webhook signatures |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `ANON_RATE_LIMIT_PER_HOUR` | `5` | Maximum anonymous submissions per IP per hour |
