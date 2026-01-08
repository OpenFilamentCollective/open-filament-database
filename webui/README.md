# Filament Database Web UI

A web-based editor for the Open Filament Database. This application allows you to browse and edit stores, brands, materials, and filaments from the database.

## Features

- **Dual Mode Operation**: Works both locally and in the cloud
  - **Local Mode**: Directly edits files on your filesystem
  - **Cloud Mode**: Stores changes in browser localStorage and exports to JSON
- **Complete Database Management**: Browse and edit all data layers
  - **Stores**: Manage filament stores with logos and shipping information
  - **Brands**: Edit brand details and view associated materials
  - **Materials**: Manage material properties and view related filaments
  - **Filaments**: Comprehensive filament editing with temperature ranges, properties, and more
- **Schema-Driven Forms**: Uses svelte-jsonschema-form (@sjsf) to automatically generate edit forms
- **ID Protection**: ID fields are automatically removed from edit forms to prevent accidental changes
- **Logo Display**: Integrated logo display for stores and brands
- **Type Generation**: Automatic TypeScript type generation from JSON schemas
- **Database Indexing**: Automatically indexes all stores and brands from the filesystem

## Getting Started

### Prerequisites

Make sure you have Node.js installed (version 18 or higher recommended).

### Installation

1. Install dependencies:

```sh
npm install
```

2. Configure environment:

Copy [.env.example](.env.example) to `.env` (or use the default `.env` provided):

```sh
# .env file content:
PUBLIC_APP_MODE=local
PUBLIC_API_BASE_URL=https://api.openfilamentdatabase.org
```

Set your preferred mode:
- `PUBLIC_APP_MODE=local` - Enables direct filesystem editing (default)
- `PUBLIC_APP_MODE=cloud` - Enables browser-based editing with export functionality

For cloud mode, set the API base URL:
- `PUBLIC_API_BASE_URL` - The external API endpoint (default: https://api.openfilamentdatabase.org)

See [ENVIRONMENT_CONFIGURATION.md](ENVIRONMENT_CONFIGURATION.md) for detailed configuration options.

3. (Optional) Generate TypeScript types from schemas:

```sh
npm run generate:types
```

This will regenerate [src/lib/types/database.ts](src/lib/types/database.ts) from the JSON schemas in `/schemas`.

### Running Locally

To run the app in local mode (directly edits files):

```sh
npm run dev
```

The app will be available at http://localhost:5173

### Running in Cloud Mode

To run in cloud mode, set `PUBLIC_APP_MODE=cloud` in your [.env](.env) file:

```sh
PUBLIC_APP_MODE=cloud
PUBLIC_API_BASE_URL=https://api.openfilamentdatabase.org
```

Alternatively, to temporarily test cloud mode functionality:

1. Open the browser console
2. Run: `localStorage.setItem('FORCE_CLOUD_MODE', 'true')`
3. Refresh the page

In cloud mode:
- Data is fetched from the external API (no local filesystem needed)
- Changes are stored in your browser's localStorage
- Click the "Cloud Mode" button in the top right to export changes as JSON
- Changes can be applied via PR later

**Note**: The webui automatically handles API differences between local and cloud modes. See [CLOUD_MODE_FIX.md](CLOUD_MODE_FIX.md) for technical details.

## Project Structure

```
webui/
├── src/
│   ├── lib/
│   │   ├── components/       # Reusable Svelte components
│   │   │   ├── Logo.svelte              # Logo display component
│   │   │   └── EnvironmentIndicator.svelte
│   │   ├── services/         # Business logic and API calls
│   │   │   └── database.ts              # Database service layer
│   │   ├── stores/           # Svelte stores for state management
│   │   │   └── environment.ts           # Environment mode management
│   │   ├── types/            # TypeScript type definitions
│   │   │   └── database.ts              # Type definitions for all entities
│   │   └── utils/            # Utility functions
│   │       ├── api.ts                   # Environment-aware API utilities
│   │       ├── formDefaults.ts          # Default form configuration
│   │       └── schemaUtils.ts           # Schema manipulation utilities
│   └── routes/
│       ├── api/              # Server-side API endpoints
│       │   ├── stores/       # Store CRUD endpoints
│       │   │   ├── [id]/     # Individual store operations
│       │   │   └── +server.ts
│       │   ├── brands/       # Brand CRUD and nested resource endpoints
│       │   │   ├── [id]/     # Individual brand operations
│       │   │   └── [brandId]/materials/[materialType]/filaments/
│       │   └── schemas/      # Schema endpoints for all entity types
│       ├── stores/           # Store pages
│       │   ├── [id]/         # Store detail/edit page
│       │   └── +page.svelte  # Store listing
│       ├── brands/           # Brand pages
│       │   ├── [id]/         # Brand detail page
│       │   │   └── materials/[materialType]/  # Material detail page
│       │   │       └── filaments/[filamentId]/  # Filament detail page
│       │   └── +page.svelte  # Brand listing
│       └── +page.svelte      # Home page with data layer navigation
```

## How It Works

### Local Mode
1. Server reads JSON files from `/stores` and `/data` directories
2. User edits store information through the web UI
3. Changes are saved directly to the filesystem via PUT requests
4. Files are written with proper JSON formatting (4 spaces, newline at end)

### Cloud Mode
1. Server reads JSON files from `/stores` and `/data` directories (read-only)
2. User edits store information through the web UI
3. Changes are saved to browser's localStorage
4. User can export all changes as a JSON file
5. JSON export can be used to create a PR later

## API Endpoints

### Stores
- `GET /api/stores` - List all stores
- `GET /api/stores/[id]` - Get specific store
- `PUT /api/stores/[id]` - Update store (local mode only)
- `GET /api/stores/[id]/logo/[filename]` - Get store logo image

### Brands
- `GET /api/brands` - List all brands
- `GET /api/brands/[id]` - Get specific brand
- `PUT /api/brands/[id]` - Update brand (local mode only)
- `GET /api/brands/[id]/logo/[filename]` - Get brand logo image
- `GET /api/brands/[brandId]/materials` - List all materials for a brand

### Materials
- `GET /api/brands/[brandId]/materials/[materialType]` - Get specific material
- `PUT /api/brands/[brandId]/materials/[materialType]` - Update material (local mode only)
- `GET /api/brands/[brandId]/materials/[materialType]/filaments` - List filaments for a material

### Filaments
- `GET /api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]` - Get specific filament
- `PUT /api/brands/[brandId]/materials/[materialType]/filaments/[filamentId]` - Update filament (local mode only)

### Schemas
- `GET /api/schemas/store` - Get store JSON schema
- `GET /api/schemas/brand` - Get brand JSON schema
- `GET /api/schemas/material` - Get material JSON schema
- `GET /api/schemas/filament` - Get filament JSON schema

## Key Implementation Details

### Form Generation
The application uses svelte-jsonschema-form (@sjsf) with the following setup:
- **Form Library**: `@sjsf/form` with `@sjsf/basic-theme` for styling
- **Validator**: `@sjsf/ajv8-validator` for JSON schema validation
- **ID Protection**: UI schemas automatically mark ID fields as readonly
- **Shared Defaults**: Common form configuration in `lib/utils/formDefaults.ts`

### Data Hierarchy
The database follows this structure:
```
Stores (independent)
Brands → Materials → Filaments
```

Each brand can have multiple materials (e.g., PLA, PETG), and each material can have multiple filament variants.

## Future Enhancements

- GitHub PR creation directly from cloud mode
- Image upload for logos
- Variant editing support
- Bulk editing capabilities
- Search and filtering functionality

## Building for Production

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Technologies Used

- **SvelteKit**: Framework for building the web application (v2)
- **Svelte 5**: Latest version with runes-based reactivity
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS v4**: Utility-first CSS framework
- **@sjsf/form**: Svelte JSON Schema Form library for dynamic form generation
- **@sjsf/ajv8-validator**: JSON schema validation using AJV 8
- **@sjsf/basic-theme**: Basic styling theme for forms
