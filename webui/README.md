# Open Filament Database - WebUI

A SvelteKit-based CRUD interface for browsing and editing the Open Filament Database. The application provides forms, validation, and data-sorting tools that mirror the JSON file structure under `/data` and `/stores`.

## Local Development Setup

The recommended path is the OFD wrapper script from the repository root, which sets up Python, Node.js, and dependencies automatically. See [docs/webui.md](/docs/webui.md) for the full guide.

```bash
# From the repo root
./ofd.sh webui            # Linux/macOS
ofd.bat webui             # Windows
```

## Available npm Scripts

Run these from inside the `webui/` directory once dependencies are installed (`npm ci`):

- `npm run dev` — Start the Vite development server with hot reload (default port 5173)
- `npm run build` — Build the production bundle
- `npm run preview` — Preview the production build locally
- `npm run check` — Run `svelte-check` for TypeScript and Svelte diagnostics
- `npm run check:watch` — Same as `check`, but re-runs on file changes
- `npm run generate:schemas` — Regenerate Zod schemas from the JSON Schemas in `/schemas`
- `npm run test` — Run the Playwright end-to-end test suite
- `npm run test:install` — Install the Playwright browsers required by the tests

## Stack

- [SvelteKit](https://svelte.dev/docs/kit) 2 with Svelte 5
- Tailwind CSS 4 (via the `@tailwindcss/vite` plugin)
- [Sveltestrap](https://github.com/sveltestrap/sveltestrap) UI components
- [Superforms](https://superforms.rocks) + [Zod](https://zod.dev) for form validation
- [Playwright](https://playwright.dev) for end-to-end tests
