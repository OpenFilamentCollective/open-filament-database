# Data Validation
To ensure all your files are correct, you can validate them using either the WebUI (recommended) or the command-line Python scripts.

## Option 1: Validate Using the WebUI (Recommended)
The easiest way to validate your changes is directly in the WebUI:

1. While editing in the WebUI, validation runs automatically in the background
2. Look for the "Validation" dropdown in the top-right corner
3. Click the "Validate" button to run a full validation check
4. Any errors or warnings will appear in the dropdown with links to the problematic data
5. Click on an error to navigate directly to the issue

This method is recommended because it provides immediate feedback and makes it easy to locate and fix issues.

## Option 2: Validate Using Python Scripts
If you prefer to validate using the command line, you'll need Python installed. If you haven't installed Python yet, [follow this guide](installing-software.md#python).

After using the WebUI, navigate back to the open-filament-database folder:
```bash
cd ..
```

Then run the validation scripts based on your platform. If any errors appear, read through them carefully and fix the issues.

### Windows
```bash
python -m ofd validate --folder-names  # Validates folder names
python -m ofd validate --logo-files    # Validates logo files
python -m ofd validate --json-files    # Validates JSON files
python -m ofd validate --store-ids     # Validates store IDs
python -m ofd validate                 # Run all validations
```

### Linux/macOS
```bash
python -m ofd validate --folder-names  # Validates folder names
python -m ofd validate --logo-files    # Validates logo files
python -m ofd validate --json-files    # Validates JSON files
python -m ofd validate --store-ids     # Validates store IDs
python -m ofd validate                 # Run all validations
```

If this gives an error about `python` not being installed, try replacing `python` with `python3`:
```bash
python3 -m ofd validate --folder-names  # Validates folder names
python3 -m ofd validate --logo-files    # Validates logo files
python3 -m ofd validate --json-files    # Validates JSON files
python3 -m ofd validate --store-ids     # Validates store IDs
python3 -m ofd validate                 # Run all validations
```

## Understanding Validation Results
- **Errors** (shown in red) are critical issues that must be fixed before submitting your pull request
- **Warnings** (shown in yellow) are suggestions for improvement but won't block your contribution
- Each validation message includes the file path and specific issue to help you locate and fix problems quickly

## Sorting Your Data
Before submitting your changes, you should sort all JSON files to ensure consistency across the database. This makes it easier to review changes and maintain the codebase.

### Using the WebUI (Recommended)
1. Click the "Sort Data" button in the top-right corner of the WebUI
2. Wait for the sorting process to complete
3. The progress will be shown in a modal window

### Using Python Scripts
Navigate to the open-filament-database folder and run:

**Windows:**
```bash
python -m ofd script style_data
```

**Linux/macOS:**
```bash
python -m ofd script style_data
```

Or if you need to use `python3`:
```bash
python3 -m ofd script style_data
```

The sorting script will organize all JSON files alphabetically and format them consistently. This is an important step before creating your pull request.
