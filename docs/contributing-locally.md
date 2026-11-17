# Contributing from a Local Clone

Most contributors don't need this guide — the [hosted web editor](http://openfilamentdatabase.org/) lets you add or fix data straight from the browser and opens the pull request for you. See the main [README](../README.md) and the [WebUI guide](webui.md) for that route.

This document is for contributors who want to work from a local clone instead — for offline editing, running the Python validator against your own data, bulk imports, or developing the WebUI itself.

## Steps at a glance

1. [Create a GitHub account](#1-sign-up-for-a-github-account)
2. [Fork the repository](#2-fork-the-project-two-click)
3. [Install the requirements](#3-install-our-requirements)
4. [Clone the database](#4-download-the-database)
5. [Make your changes](#5-make-your-changes)
6. [Validate and sort your changes](#6-validate-and-sort-your-changes)
7. [Submit your changes](#7-submit-your-changes)

---

## 1. Sign up for a GitHub Account
If you don't have one already, [create a free GitHub account](https://github.com/join).

## 2. Fork the Project (Two-Click)
Click the **Fork** button in the top right of [the repo page](https://github.com/OpenFilamentCollective/open-filament-database); a guide is [available here if needed](forking.md).

![Fork button getting pressed](img/forking01.png)

## 3. Install our requirements
If you don't have Git installed, [follow this guide](installing-software.md#git). The OFD wrapper script will help you install Python and Node.js automatically (see step 5).

## 4. Download the database
Download the database using either [this guide](cloning.md) or by just using the command below, with `YOUR_USERNAME` replaced ofc!

```bash
git clone https://github.com/YOUR_USERNAME/open-filament-database.git
cd open-filament-database
```

## 5. Make your changes
You have two options:

**Option A — Run the WebUI locally (recommended):**

The OFD wrapper handles all setup automatically:

Linux/macOS:
```bash
./ofd.sh webui
```

Windows:
```cmd
ofd.bat webui
```

On first run, the wrapper will:
- Check if Python 3.10+ and Node.js are installed (and help install them if not)
- Create a Python virtual environment
- Install all required dependencies
- Start the WebUI development server

Then access it in your browser at <http://localhost:5173>. The WebUI includes built-in validation and data sorting features — see the [full WebUI guide](webui.md).

If you'd rather run things by hand, [install our requirements](installing-software.md) and then:

```bash
cd webui
npm ci
npm run dev
```

**Option B — Edit JSON files directly:** follow the [manual editing guide](manual.md).

## 6. Validate and sort your changes
The WebUI can validate and sort your data automatically:

1. Click the "Validate" button in the top-right corner to check for errors
2. Click the "Sort Data" button to organize your JSON files consistently
3. Fix any validation errors that appear (they'll be highlighted in red)

Alternatively, you can use the command-line validator ([full guide](validation.md)):

Linux/macOS:
```bash
./ofd.sh validate                 # Run all validations
./ofd.sh validate --folder-names  # Validate folder names
./ofd.sh validate --json-files    # Validate JSON files against schemas
./ofd.sh validate --logos         # Validate logo files (size, naming, format)
./ofd.sh validate --store-ids     # Validate store IDs in purchase links
./ofd.sh validate --gtin          # Validate GTIN/EAN fields
```

Windows:
```cmd
ofd.bat validate                  # Run all validations
ofd.bat validate --folder-names   # Validate folder names
ofd.bat validate --json-files     # Validate JSON files against schemas
ofd.bat validate --logos          # Validate logo files (size, naming, format)
ofd.bat validate --store-ids      # Validate store IDs in purchase links
ofd.bat validate --gtin           # Validate GTIN/EAN fields
```

## 7. Submit your changes
Before submitting, make sure your data is sorted consistently:
- **In the WebUI:** Click the "Sort Data" button in the top-right corner
- **Or via command line:** Run `./ofd.sh script style_data` (Linux/macOS) or `ofd.bat script style_data` (Windows)

Then add your changes:
```bash
git add .
```

Create a commit with a descriptive message (e.g., "Added Elegoo Red PLA variant"):
```bash
git commit -m "COMMIT_MESSAGE"
```

Upload your changes to GitHub:
```bash
git push -u origin YOUR_BRANCHNAME
```

Finally, make a pull request [using this guide](pull-requesting.md).
