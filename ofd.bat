@echo off
setlocal enabledelayedexpansion

:: OFD - Open Filament Database CLI Wrapper
:: Cross-platform setup and execution script for Windows
::
:: Usage: ofd <command> [options]

:: Configuration
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "VENV_DIR=%SCRIPT_DIR%\.venv"
set "WEBUI_DIR=%SCRIPT_DIR%\webui"
set "REQUIREMENTS_FILE=%SCRIPT_DIR%\requirements.txt"
set "SETUP_MARKER=%VENV_DIR%\.ofd_setup_complete"
set "WEBUI_SETUP_MARKER=%WEBUI_DIR%\node_modules\.ofd_webui_setup"
set "DOCS_URL=https://github.com/OpenFilamentCollective/open-filament-database/blob/main/docs/installing-software.md"

:: Parse first argument
set "FIRST_ARG=%~1"
set "NEEDS_WEBUI=0"

if "%FIRST_ARG%"=="setup" goto :run_setup
if "%FIRST_ARG%"=="--no-setup" (
    set "SKIP_SETUP=1"
    shift
    goto :parse_args
)
if "%FIRST_ARG%"=="-h" goto :show_help
if "%FIRST_ARG%"=="--help" goto :show_help
if "%FIRST_ARG%"=="" goto :default_webui

:parse_args
:: Collect all arguments and check for webui
set "ARGS="
:collect_args
if "%~1"=="" goto :done_args
if "%~1"=="webui" set "NEEDS_WEBUI=1"
set "ARGS=%ARGS% %1"
shift
goto :collect_args
:done_args

:: Check if Python setup is needed
if not defined SKIP_SETUP (
    if not exist "%SETUP_MARKER%" (
        echo [INFO] First run detected. Setting up Python environment...
        call :run_python_setup
        if errorlevel 1 exit /b 1
    )
)

:: Check if WebUI setup is needed
if "%NEEDS_WEBUI%"=="1" (
    if not exist "%WEBUI_SETUP_MARKER%" (
        echo [INFO] WebUI first run. Setting up Node.js dependencies...
        call :setup_webui
        if errorlevel 1 exit /b 1
    )
)

:: Activate venv and run
if exist "%VENV_DIR%\Scripts\activate.bat" (
    call "%VENV_DIR%\Scripts\activate.bat"
    set "PYTHON_CMD=python"
) else (
    echo [ERROR] Virtual environment not found. Run: ofd setup
    exit /b 1
)

:: Run OFD CLI
%PYTHON_CMD% -m ofd %ARGS%
exit /b %ERRORLEVEL%

:: ============================================
:: Functions
:: ============================================

:default_webui
:: Default behavior: run webui
set "NEEDS_WEBUI=1"
set "ARGS=webui"
goto :done_args

:show_help
echo OFD - Open Filament Database CLI
echo.
echo Usage: ofd ^<command^> [options]
echo.
echo Wrapper Commands:
echo   setup       Run first-time setup (install Python dependencies)
echo   --no-setup  Skip auto-setup check
echo.
echo OFD Commands (passed to Python CLI):
echo   validate    Validate data files against schemas
echo   build       Build database exports (JSON, SQLite, CSV, API)
echo   serve       Start development server with CORS
echo   script      Run utility scripts
echo   webui       Start the WebUI development server
echo.
echo Examples:
echo   ofd                    # Start WebUI dev server (default)
echo   ofd setup              # Run setup manually
echo   ofd validate           # Validate all data
echo   ofd webui              # Start WebUI dev server
echo   ofd build              # Build all exports
echo.
echo Note: Running without arguments starts the WebUI
echo       Node.js dependencies are only installed when you first use 'webui'
echo.
echo Documentation: %DOCS_URL%
exit /b 0

:run_setup
echo ========================================
echo OFD - Setup
echo ========================================
echo.

:: Check Python
call :detect_python
if errorlevel 1 (
    echo [WARN] Python 3.10+ not found.
    call :try_install_python
    call :detect_python
    if errorlevel 1 (
        echo [ERROR] Could not install Python automatically.
        echo Please install Python from: https://apps.microsoft.com/detail/9pnrbtzxmb4z
        echo Or see: %DOCS_URL%
        exit /b 1
    )
)
echo [OK] Python found: %PYTHON_CMD%

:: Check Python version
call :check_python_version
if errorlevel 1 (
    echo [ERROR] Python 3.10+ is required.
    echo Please upgrade Python. See: %DOCS_URL%
    exit /b 1
)

:: Create virtual environment
if not exist "%VENV_DIR%" (
    echo [INFO] Creating Python virtual environment...
    %PYTHON_CMD% -m venv "%VENV_DIR%"
)

:: Activate and install dependencies
call "%VENV_DIR%\Scripts\activate.bat"

echo [INFO] Installing Python dependencies...
pip install -q --upgrade pip
pip install -q -r "%REQUIREMENTS_FILE%"
pip install -q -e "%SCRIPT_DIR%"
echo [OK] Python dependencies installed

:: Mark setup complete
echo. > "%SETUP_MARKER%"

:: Check Node.js status (informational only)
call :detect_npm
if errorlevel 1 (
    echo [WARN] Node.js/npm not found. WebUI dependencies will be installed when you run 'ofd webui'
) else (
    for /f "tokens=*" %%v in ('node --version') do echo [OK] Node.js found: %%v
    echo [INFO] WebUI dependencies will be installed when you first run 'ofd webui'
)

echo.
echo [OK] Setup complete! You can now use: ofd ^<command^>
echo.
exit /b 0

:run_python_setup
:: Check Python
call :detect_python
if errorlevel 1 (
    echo [WARN] Python 3.10+ not found.
    call :try_install_python
    call :detect_python
    if errorlevel 1 (
        echo [ERROR] Could not install Python automatically.
        echo Please install Python from: https://apps.microsoft.com/detail/9pnrbtzxmb4z
        echo Or see: %DOCS_URL%
        exit /b 1
    )
)

:: Check Python version
call :check_python_version
if errorlevel 1 (
    echo [ERROR] Python 3.10+ is required.
    echo Please upgrade Python. See: %DOCS_URL%
    exit /b 1
)

:: Create virtual environment
if not exist "%VENV_DIR%" (
    echo [INFO] Creating Python virtual environment...
    %PYTHON_CMD% -m venv "%VENV_DIR%"
)

:: Activate and install dependencies
call "%VENV_DIR%\Scripts\activate.bat"

echo [INFO] Installing Python dependencies...
pip install -q --upgrade pip
pip install -q -r "%REQUIREMENTS_FILE%"
pip install -q -e "%SCRIPT_DIR%"

:: Mark setup complete
echo. > "%SETUP_MARKER%"
echo [OK] Python environment ready
exit /b 0

:setup_webui
:: Check Node.js
call :detect_npm
if errorlevel 1 (
    echo [WARN] Node.js/npm not found.
    call :try_install_nodejs
    call :detect_npm
    if errorlevel 1 (
        echo [ERROR] Could not install Node.js automatically.
        echo Please install Node.js manually from: https://nodejs.org/
        echo Or see: %DOCS_URL%
        exit /b 1
    )
)

:: Install Node.js dependencies
echo [INFO] Installing Node.js dependencies for WebUI...
pushd "%WEBUI_DIR%"
call npm ci
if errorlevel 1 (
    popd
    echo [ERROR] Failed to install Node.js dependencies
    exit /b 1
)
popd

:: Mark WebUI setup complete
echo. > "%WEBUI_SETUP_MARKER%"
echo [OK] Node.js dependencies installed
exit /b 0

:try_install_python
:: Try to install Python using Windows package managers
echo [INFO] Attempting to install Python...

:: Try winget first (built into Windows 11 and Windows 10 22H2+)
where winget >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Using winget to install Python...
    winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    if not errorlevel 1 (
        echo [OK] Python installed via winget
        :: Refresh PATH
        call :refresh_path
        exit /b 0
    )
)

:: Try chocolatey
where choco >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Using Chocolatey to install Python...
    choco install python -y
    if not errorlevel 1 (
        echo [OK] Python installed via Chocolatey
        call :refresh_path
        exit /b 0
    )
)

:: Try scoop
where scoop >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Using Scoop to install Python...
    scoop install python
    if not errorlevel 1 (
        echo [OK] Python installed via Scoop
        exit /b 0
    )
)

echo [WARN] No supported package manager found (winget, choco, scoop)
exit /b 1

:try_install_nodejs
:: Try to install Node.js using Windows package managers
echo [INFO] Attempting to install Node.js...

:: Try winget first
where winget >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Using winget to install Node.js...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if not errorlevel 1 (
        echo [OK] Node.js installed via winget
        call :refresh_path
        exit /b 0
    )
)

:: Try chocolatey
where choco >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Using Chocolatey to install Node.js...
    choco install nodejs-lts -y
    if not errorlevel 1 (
        echo [OK] Node.js installed via Chocolatey
        call :refresh_path
        exit /b 0
    )
)

:: Try scoop
where scoop >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Using Scoop to install Node.js...
    scoop install nodejs-lts
    if not errorlevel 1 (
        echo [OK] Node.js installed via Scoop
        exit /b 0
    )
)

echo [WARN] No supported package manager found (winget, choco, scoop)
exit /b 1

:refresh_path
:: Refresh PATH environment variable to pick up newly installed programs
:: This reads the current PATH from the registry
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYSPATH=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USERPATH=%%b"
set "PATH=%SYSPATH%;%USERPATH%"
exit /b 0

:detect_python
:: Try python first (Windows usually has python, not python3)
where python >nul 2>&1
if not errorlevel 1 (
    :: Verify it's Python 3
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
    echo !PY_VER! | findstr /C:"Python 3" >nul
    if not errorlevel 1 (
        set "PYTHON_CMD=python"
        exit /b 0
    )
)
:: Try python3 as fallback
where python3 >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=python3"
    exit /b 0
)
exit /b 1

:check_python_version
:: Check if Python version is >= 3.10
for /f "tokens=2 delims= " %%v in ('!PYTHON_CMD! --version 2^>^&1') do set "PY_VERSION=%%v"
for /f "tokens=1,2 delims=." %%a in ("!PY_VERSION!") do (
    set "PY_MAJOR=%%a"
    set "PY_MINOR=%%b"
)
if !PY_MAJOR! LSS 3 exit /b 1
if !PY_MAJOR! EQU 3 if !PY_MINOR! LSS 10 exit /b 1
exit /b 0

:detect_npm
where npm >nul 2>&1
exit /b %ERRORLEVEL%
