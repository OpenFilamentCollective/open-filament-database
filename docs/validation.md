# Data Validation
To ensure all your files are correct, you can validate them using either the WebUI (recommended) or the command-line tooling.

## Option 1: Validate Using the WebUI (Recommended)
The easiest way to validate your changes is directly in the WebUI — either the hosted instance at <http://openfilamentdatabase.org/> (no setup) or a local copy:

1. While editing in the WebUI, validation runs automatically in the background
2. Look for the "Validation" dropdown in the top-right corner
3. Click the "Validate" button to run a full validation check
4. Any errors or warnings will appear in the dropdown with links to the problematic data
5. Click on an error to navigate directly to the issue

This method is recommended because it provides immediate feedback and makes it easy to locate and fix issues. In cloud mode (the hosted instance) validation runs in-process against the JSON schemas; in local mode it shells out to the Python validator described below.

## Option 2: Validate From the Command Line
If you prefer the command line, the OFD wrapper script will set up Python automatically and run the validator. If you haven't installed Python yet, [follow this guide](installing-software.md#python).

### Linux/macOS
```bash
./ofd.sh validate                 # Run all validations
./ofd.sh validate --folder-names  # Validate folder names match JSON content
./ofd.sh validate --json-files    # Validate JSON files against schemas
./ofd.sh validate --logos         # Validate logo files (dimensions, naming, format)
./ofd.sh validate --store-ids     # Validate store IDs in purchase links
./ofd.sh validate --gtin          # Validate GTIN/EAN fields
```

### Windows
```cmd
ofd.bat validate
ofd.bat validate --folder-names
ofd.bat validate --json-files
ofd.bat validate --logos
ofd.bat validate --store-ids
ofd.bat validate --gtin
```

### Direct Python Invocation
If you've already activated a Python virtual environment, you can call the CLI directly:

```bash
python -m ofd validate            # Run all validations
python -m ofd validate --gtin     # Run a specific check
```

If `python` is not on your `PATH`, try `python3` instead.

### Using uv or Task
The repository ships with both a `uv` lockfile and a `Taskfile.yml` for contributors who prefer those tools:

```bash
uv run -m ofd validate            # uv-managed environment
task validate                     # Taskfile alias (uses uv under the hood)
```

## Understanding Validation Results
- **Errors** (shown in red) are critical issues that must be fixed before submitting your pull request
- **Warnings** (shown in yellow) are suggestions for improvement but won't block your contribution
- Each validation message includes the file path and specific issue to help you locate and fix problems quickly

You can also produce machine-readable output with `--json`, which is useful for scripts and editors. Pass `--progress` to emit incremental progress events (used by the WebUI).

## Canonical UUIDs
Every entity carries a stable, slug-independent `uuid` (see [Canonical UUIDs — leave them empty](manual.md#-canonical-uuids--leave-them-empty)). You never author these — CI assigns one to any entry left without a UUID when your pull request is merged — but the `ofd uuid` command lets you manage them locally:

```bash
python -m ofd uuid new              # print a fresh canonical UUID
python -m ofd uuid assign           # assign a UUID to every entity missing one (writes files)
python -m ofd uuid assign --check   # report entities missing a UUID (exit non-zero); writes nothing
python -m ofd uuid find <uuid>      # print the file (and spool index) for a canonical UUID, or where a moved_from UUID now lives
python -m ofd uuid check            # verify every UUID (incl. moved_from) is present, well-formed, and globally unique
python -m ofd uuid check --allow-missing-uuids   # skip the presence requirement (for PR / pre-merge checks)
python -m ofd uuid list             # print the uuid -> path index
```

By default, **a missing UUID is a validation error** — `ofd uuid check` requires every entity to have a valid, unique UUID. The one exception is pre-merge contexts, where UUIDs are *meant* to be empty (CI assigns them on merge); those pass `--allow-missing-uuids`, which still flags malformed or duplicated UUIDs but tolerates absent ones. In CI:
- **On pull requests** (and on the raw merge commit, which also precedes assignment), the check runs with `--allow-missing-uuids`, so leaving the field empty is fine.
- **After merge**, CI runs `ofd uuid assign` to backfill the empty ones, then `ofd uuid check` (strict) to guarantee every entity on `main` has a valid, unique UUID.

The JSON schemas accept an empty string or a valid UUIDv4 for `uuid`; any other value fails schema validation.

### Moved / former UUIDs (`moved_from`)
An entity that supersedes another (after a merge or move) records the retired UUID(s) in an optional `moved_from` array, so old references still resolve. `ofd uuid find <old-uuid>` follows these redirects, and `ofd uuid check` validates them alongside `uuid`: each `moved_from` entry must be a well-formed UUIDv4, must not point at its own owner, must not collide with any live `uuid`, and must be claimed by only one entity. These checks run regardless of `--allow-missing-uuids`. The build additionally emits `api/v1/uuid-index.json`, a flat `{old_uuid: current_uuid}` redirect map for downstream consumers. You never author `moved_from` by hand — the `merge_data` / `deduplicate_data` scripts populate it when they delete a merged-away entity.

## Sorting Your Data
Before submitting your changes, you should sort all JSON files to ensure consistency across the database. This makes it easier to review changes and maintain the codebase.

### Using the WebUI (Recommended)
1. Click the "Sort Data" button in the top-right corner of the WebUI
2. Wait for the sorting process to complete
3. The progress will be shown in a modal window

### Using the Command Line
**Linux/macOS:**
```bash
./ofd.sh script style_data
```

**Windows:**
```cmd
ofd.bat script style_data
```

**Or using uv / Task:**
```bash
uv run -m ofd script style_data
task style
```

The sorting script will organize all JSON files alphabetically and format them consistently. This is an important step before creating your pull request.
