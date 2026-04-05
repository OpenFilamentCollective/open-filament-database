# Copilot Coding Agent Instructions

## Repository Overview

This is the **Open Filament Database** - an open-source, community-driven database of 3D printing filament information. The repository contains structured filament data, validation tools, and a web-based editing interface.

**Key Information:**
- **Project Type**: Data repository with Python validation tools and SvelteKit WebUI
- **Languages**: Python 3.11+, TypeScript/JavaScript (Node.js 22+), JSON
- **Size**: ~26 brands, hundreds of filaments, thousands of variants
- **Framework**: SvelteKit for WebUI, Tailwind CSS, Playwright for testing
- **Target Runtime**: Node.js server for WebUI, Python scripts for validation

## Data Architecture & File Structure

The repository follows a strict hierarchical structure:

```
data/
├── [Brand Name]/                     # e.g., "Bambu Lab", "Prusament"
│   ├── brand.json                    # Brand metadata (required)
│   ├── [brand-logo].(png|jpg|...)    # Brand logo file
│   └── [Material]/                   # e.g., "PLA", "ABS", "PETG"
│       ├── material.json             # Material metadata (required)
│       └── [Filament]/               # e.g., "Basic", "Tough+"
│           ├── filament.json         # Filament metadata (required)
│           └── [Variant]/            # e.g., "Blue", "Red", "Transparent"
│               ├── variant.json      # Color/variant info (required)
│               └── sizes.json        # Available sizes & purchase links (required)
```

**Additional Key Directories:**
- `/schemas/` - JSON Schema files for validation
- `/webui/` - Complete SvelteKit web application
- `/stores/` - Store/retailer definitions
- `/profiles/` - Auto-generated slicer profiles
- `/.github/workflows/` - CI/CD automation

## Build, Test & Validation Commands

### Environment Setup
**Recommended: Use the OFD wrapper script (auto-installs everything):**
```bash
# Linux/macOS - runs setup automatically on first use
./ofd.sh setup

# Windows
ofd.bat setup
```

**Manual setup (if needed):**
```bash
# Python dependencies (required for validation)
pip install -r requirements.txt

# WebUI dependencies (required for web interface)
cd webui
npm ci
cd ..
```

### Data Validation (Critical for PRs)
**Run these in order after any data changes:**
```bash
# Using wrapper script (recommended)
./ofd.sh validate                   # Run all validations (Linux/macOS)
ofd.bat validate                    # Run all validations (Windows)

# Individual validation types
./ofd.sh validate --folder-names    # Validate folder naming consistency
./ofd.sh validate --json-files      # Validate JSON schema compliance
./ofd.sh validate --store-ids       # Validate store ID references
```

**Direct Python invocation (if not using wrapper):**
```bash
python -m ofd validate --folder-names
python -m ofd validate --json-files
python -m ofd validate --store-ids
python -m ofd validate              # Run all
```

**Platform Notes:**
- Use `./ofd.sh` (Linux/macOS) or `ofd.bat` (Windows) wrapper for automatic setup
- Or use `python -m ofd` or `uv run -m ofd` for direct CLI access
- If `python` command fails, try `python3 -m ofd`

### WebUI Development & Testing
```bash
# Using wrapper script (recommended - handles all setup)
./ofd.sh webui                      # Start dev server (Linux/macOS)
./ofd.sh webui --port 3000          # Custom port
./ofd.sh webui --open               # Open browser automatically
ofd.bat webui                       # Start dev server (Windows)

# Manual approach
cd webui
npm run dev                         # Start development server (http://localhost:5173)
npm run check                       # Type checking (expect ~103 TypeScript errors - this is normal)
npm run build                       # Build for production (succeeds despite TypeScript errors)
npm run preview                     # Preview production build

# Run Playwright tests (may fail in CI due to browser installation)
npm run test:install                # Install browsers first
npm test
```

**Known Issues & Workarounds:**
- **TypeScript errors**: ~103 errors exist but don't prevent builds
- **Playwright CI failures**: Browser installation often fails in CI environments
- **Build warnings**: Accessibility warnings are non-blocking
- **npm vulnerabilities**: Some known vulnerabilities in dependencies (non-critical)

### Profile Management
```bash
# Update slicer profiles (automated daily via GitHub Actions)
python -m ofd script load_profiles
```

## GitHub Actions & CI/CD

The repository runs these validations on every PR:

1. **Data Validation** (`validate_data.yaml`):
   - Runs on changes to `data/`, `stores/`, `schemas/`, or validation scripts
   - Matrix job: folder-names, json-files, store-ids
   - **Environment**: Ubuntu 24.04, Python 3.11

2. **WebUI Tests** (`webui-tests.yml`):  
   - Runs on changes to `webui/`
   - Steps: npm ci → build → Playwright tests
   - **Environment**: Ubuntu latest, Node.js 22

3. **Profile Updates** (`update_profiles.yaml`):
   - Scheduled daily at midnight UTC
   - Downloads and processes slicer profiles

## Common Development Workflows

### Adding New Brand Data
1. Create brand folder with consistent naming (no illegal characters)
2. Add `brand.json` with required fields: brand, logo, website, origin
3. Add logo image file
4. **Always validate**: `python -m ofd validate --folder-names --json-files`

### Modifying WebUI
1. Start the WebUI: `./ofd.sh webui` (or `ofd.bat webui` on Windows)
   - Wrapper handles all setup automatically on first run
2. Make changes
3. Build to verify: `cd webui && npm run build`
4. **Note**: TypeScript errors are expected and don't block builds

### Debugging Validation Failures
- Check folder naming matches JSON content exactly
- Verify JSON schema compliance using files in `/schemas/`
- Ensure all required JSON files exist at each hierarchy level
- Use illegal character list: `#%&{}\\<>*?/$!'":@+\`|=` (see `ofd/validation/validators.py`)

## WebUI Architecture Patterns

### Entity Actions (Copy/Duplicate/Paste/Delete)

All entity actions (copy, duplicate, paste, delete) are centralized through **shared composables** in `webui/src/lib/utils/useEntityActions.svelte.ts`. These ensure that both detail-page dropdowns AND list-view card menus go through the exact same code path.

**Key composables:**
- `createCopyAction(entityType, loadChildrenFn?)` - Handles copy with optional "with/without children" modal
- `createDuplicateAction(entityType, hasChildren, openFormFn)` - Handles duplicate with optional children modal
- `createPasteHandler(entityType, openFormFn, hasConflict?)` - Handles paste with conflict-aware name suffixing

**Critical rule:** Never create inline copy/duplicate/paste handlers directly in page components. Always use these composables to avoid action inconsistencies between detail-page dropdowns and list-view card menus.

**Clipboard service** (`webui/src/lib/services/clipboardService.ts`):
- Uses localStorage as primary store, system clipboard as secondary
- `ClipboardEntry` includes optional `children` field for nested data
- `prepareDuplicateData()` clears identity fields and appends "(Copy)" to names
- Uses `JSON.parse(JSON.stringify())` instead of `structuredClone` (Svelte 5 proxies can't be structuredCloned)

**Duplicate service** (`webui/src/lib/services/duplicateService.ts`):
- `loadXxxChildren()` - loads nested children into clipboard-compatible structure
- `pasteXxxChildren()` - creates children from clipboard data under a new parent
- `duplicateXxxChildren()` - duplicates children from one parent to another via DB

### Schema Filtering & Supplementary Keys

The change store (`webui/src/lib/stores/changes.ts`) filters entity data through JSON schemas via `filterToSchema()`. Fields not in the schema are stripped. For fields that are needed for change tracking but aren't in the schema (like `materialType` for materials, `sizes` for variants), add them to `SUPPLEMENTARY_KEYS`:

```typescript
const SUPPLEMENTARY_KEYS: Partial<Record<EntityType, string[]>> = {
    variant: ['sizes'],
    material: ['id', 'materialType']
};
```

**Warning:** If you add a field to entity data that needs to survive change tracking but isn't in the JSON schema, you MUST add it to `SUPPLEMENTARY_KEYS` or it will be silently stripped.

### Entity Detail Page Structure

Each entity detail page follows this pattern:
1. **Shared action composables** at the top (via `createCopyAction`, `createDuplicateAction`, `createPasteHandler`)
2. **Data loading** via `$effect` watching route params
3. **Edit/Delete/Duplicate/Paste handlers** as async functions
4. **Template** with `EntityDetails` (showing fields + Edit button + `EntityActionDropdown`) and `ChildListPanel` (showing child cards with actions)
5. **Modals** at the bottom: Edit, Delete, DuplicateOptions, CopyOptions, Duplicate form, Paste form, CloudCompare

### UI Components

- `DropdownMenu.svelte` - Reusable kebab dropdown (auto-strips empty separators)
- `ContextMenu.svelte` - Right-click menu positioned at pointer
- `EntityActionDropdown.svelte` - Entity-specific dropdown with Duplicate/Copy/Paste/View/Delete
- `DuplicateOptionsModal.svelte` - "With children" / "Without children" / "Cancel" chooser
- `CloudCompareModal.svelte` - Side-by-side JSON diff (cloud mode only)
- `EntityCard.svelte` - Cards with inline dropdown + right-click context menu

### Form Create vs Update Detection

Forms determine their submit button label ("Create X" vs "Update X") by checking `entity?.id`. Since `prepareDuplicateData()` strips `id`, duplicate/paste forms correctly show "Create". If you add a new form, use `?.id` for this check, not just truthiness of the entity prop.

## Critical Configuration Files

**Root Level:**
- `requirements.txt` - Python dependencies (jsonschema, iniconfig)
- `ofd/` - Unified CLI package with validation, build, serve, script, and webui commands
- `ofd.sh` - Cross-platform wrapper script for Linux/macOS (auto-setup, dependency detection)
- `ofd.bat` - Cross-platform wrapper script for Windows (auto-setup, dependency detection)

**WebUI Configuration:**
- `webui/package.json` - npm scripts and dependencies
- `webui/svelte.config.js` - SvelteKit configuration
- `webui/vite.config.js` - Vite build configuration  
- `webui/playwright.config.ts` - E2E test configuration (baseURL: localhost:4173)
- `webui/tailwind.config.js` - Tailwind CSS configuration

**Validation Schemas:**
- `schemas/brand_schema.json` - Brand metadata validation
- `schemas/material_schema.json` - Material properties validation
- `schemas/filament_schema.json` - Filament specifications validation
- `schemas/variant_schema.json` - Color/variant data validation
- `schemas/sizes_schema.json` - Size and purchase link validation
- `schemas/store_schema.json` - Store/retailer definitions

## Time Estimates for Commands

- **Python validation**: 5-15 seconds per validation type
- **WebUI npm ci**: 15-30 seconds
- **WebUI build**: 5-10 seconds  
- **WebUI type check**: 10-20 seconds
- **Playwright test install**: 2-5 minutes (or fails in CI)
- **Profile updates**: 1-2 minutes

**Additional Documentation:**
- `/docs/` directory contains user guides for contributors:
  - `validation.md` - Detailed validation instructions
  - `webui.md` - WebUI usage guide
  - `installing-software.md` - Setup instructions for contributors
  - `forking.md`, `cloning.md`, `pull-requesting.md` - Git workflow guides

## GitHub Templates & Community

The repository includes structured templates for community contributions:

**Issue Templates** (`.github/ISSUE_TEMPLATE/`):
- `brand-request.md` - For requesting new brand additions
- `filament-request.md` - For requesting new filament additions  
- `store-request.md` - For requesting new store/retailer additions

**Pull Request Templates** (`.github/PULL_REQUEST_TEMPLATE/`):
- `data-addition.md` - For data contribution PRs
- `webui-changes.md` - For WebUI/code changes

## Trust These Instructions

These instructions are comprehensive and tested. Only search the codebase if:
- You encounter errors not mentioned in the "Known Issues" sections
- You need to understand specific business logic beyond data validation/WebUI development
- The information here appears outdated or incorrect
- You're implementing entirely new functionality not covered above

For routine data validation, WebUI development, or build processes, follow these instructions directly without additional exploration.