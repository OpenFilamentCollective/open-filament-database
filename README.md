<img align="left" width="80" height="80" src="docs/img/logo.png">
<img src="https://github.com/OpenFilamentCollective/open-filament-database/actions/workflows/validate_data.yaml/badge.svg"> 

# Open Filament Database
The Open Filament Database, hosted by the new "Open Filament Collective" group, currently facilitated by SimplyPrint.

## ✅ Contributing: how to add to the database
The beautiful thing about the database is that it's open source so anyone can contribute, whether you're a hobbyist, print farm or brand.

The steps to contribute to the database are simple but may get technical at times depending on how you want to do it, don't worry if you don't all understand terms, we'll guide you through it.

### So what are the steps?
1. **Create a GitHub account**
2. **Create a copy of the database** (called "forking" this repository)
3. **Install a few small applications** (Git, Python, Node.js)
4. **Download your copy of the database** (called "cloning" it).
5. **Use either our simple web editor or use the manual method**
6. **Check if your data has errors**
7. **Upload your data and make what's called a pull request**

## Let's do it!

### 1. Sign up for a GitHub Account
If you don’t have one already, [create a free GitHub account](https://github.com/join).

### 2. Fork the Project (Two-Click)
Click the **Fork** button in the top right of this page, a guide is [available here if needed](docs/forking.md)
![Fork button getting pressed](docs/img/forking01.png)
### 3. Install our requirements
If you don't have Git installed, [follow this guide](docs/installing-software.md#git). The OFD wrapper script will help you install Python and Node.js automatically (see step 5).

### 4. Download the database
Download the database using either [this guide](docs/cloning.md) or by just using the command below, with `YOUR_USERNAME` replaced ofc!
```bash
git clone https://github.com/YOUR_USERNAME/open-filament-database.git
cd open-filament-database
```
### 5. Make your changes!
Use the web editor (recommended) or edit files manually:

**Using the OFD Wrapper (Recommended - handles setup automatically):**

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

Then access it in your browser at http://localhost:5173

The WebUI includes built-in validation and data sorting features to help ensure your changes are correct. [Full WebUI guide](docs/webui.md)

**Manual setup:** If you prefer to set things up manually, [install our requirements](docs/installing-software.md) and then:
```bash
cd webui
npm ci
npm run dev
```

**Manual editing:** If you prefer to edit files directly, [follow this guide](docs/manual.md)

### 6. Validate and sort your changes
The WebUI can validate and sort your data automatically:

1. Click the "Validate" button in the top-right corner to check for errors
2. Click the "Sort Data" button to organize your JSON files consistently
3. Fix any validation errors that appear (they'll be highlighted in red)

Alternatively, you can use the command-line validation scripts ([see guide](docs/validation.md)):

Linux/macOS:
```bash
./ofd.sh validate                 # Run all validations
./ofd.sh validate --folder-names  # Validates folder names
./ofd.sh validate --json-files    # Validates JSON files
```

Windows:
```cmd
ofd.bat validate                  # Run all validations
ofd.bat validate --folder-names   # Validates folder names
ofd.bat validate --json-files     # Validates JSON files
```
### 7. Submit your changes
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

Finally, make a pull request [using this guide](docs/pull-requesting.md)
