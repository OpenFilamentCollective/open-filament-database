# WebUI - User Interface on the Web
The WebUI is a simple but effective user interface that allows you to modify the database in a nice and easy way without having to crawl through terminals or files.

## Structure
The WebUI is structured in layers, as shown below:
```
[brand (Bambu Lab, eSUN, SUNLU)]
└── [material (e.g. PLA, ABS, PETG)]
    └── [filament (e.g. sparkly, pla basic)]
        └── [variant (e.g. Black, Rainbow, Variant B)]
```
You can add a brand on the homepage of the website, then modify the brand's materials, filaments, and the individual variants of those filaments.

## Getting Started

### Quick Start (Recommended)

The easiest way to start the WebUI is using the OFD wrapper script, which handles all setup automatically:

**Linux/macOS:**
```bash
./ofd.sh webui
```

**Windows:**
```cmd
ofd.bat webui
```

On first run, the wrapper will automatically:
- Check for Python 3.10+ and Node.js (offering to install if missing)
- Create a Python virtual environment
- Install all required dependencies
- Start the WebUI development server

Then navigate to http://localhost:5173 and start editing!

### WebUI Command Options

```bash
./ofd.sh webui              # Start on default port (5173)
./ofd.sh webui --port 3000  # Start on custom port
./ofd.sh webui --open       # Open browser automatically
./ofd.sh webui --install    # Force reinstall npm dependencies
```

### Manual Setup

If you prefer manual setup:

1. [Install dependencies manually](installing-software.md)

2. Enter the WebUI folder and install dependencies:
   ```bash
   cd webui
   npm ci
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Navigate to the link printed in the terminal, typically http://localhost:5173
5. Start editing the database!

## Features

### Data Validation
The WebUI includes built-in validation to help ensure your data is correct before submitting. You can validate your changes in two ways:

1. **Automatic Validation** - The WebUI automatically checks your data as you make changes and displays any issues in the navigation bar
2. **Manual Validation** - Click the "Validate" button in the top-right corner to run a full validation check

When validation issues are found:
- A badge appears on the "Validation" dropdown showing the number of errors and warnings
- Errors are displayed in red (critical issues that must be fixed)
- Warnings are displayed in yellow (suggestions for improvement)
- Click on any validation issue to jump directly to the problematic data

### Data Sorting
The WebUI can automatically sort your data files to ensure consistency across the database:

1. Click the "Sort Data" button in the top-right corner
2. The sorting process will run and organize all JSON files alphabetically
3. A progress modal will show you the sorting status

This ensures that all contributors follow the same data organization, making it easier to review changes and maintain the database.

### Real-time Progress
When running validation or sorting operations, you'll see a progress modal that shows:
- Current stage of the operation
- Progress percentage
- Detailed status messages
- Any errors that occur during the process