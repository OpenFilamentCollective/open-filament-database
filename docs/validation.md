# Data Validation
To ensure all your files are correct, you can validate them using either the WebUI (recommended) or the command-line tooling.

## Option 1: Validate Using the WebUI (Recommended)
The easiest way to validate your changes is directly in the WebUI:

1. While editing in the WebUI, validation runs automatically in the background
2. Look for the "Validation" dropdown in the top-right corner
3. Click the "Validate" button to run a full validation check
4. Any errors or warnings will appear in the dropdown with links to the problematic data
5. Click on an error to navigate directly to the issue

This method is recommended because it provides immediate feedback and makes it easy to locate and fix issues.

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
