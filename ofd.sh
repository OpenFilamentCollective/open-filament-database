#!/usr/bin/env bash
#
# OFD - Open Filament Database CLI Wrapper
# Cross-platform setup and execution script for Linux/macOS
#
# Usage: ./ofd.sh <command> [options]
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
WEBUI_DIR="$SCRIPT_DIR/webui"
REQUIREMENTS_FILE="$SCRIPT_DIR/requirements.txt"
SETUP_MARKER="$VENV_DIR/.ofd_setup_complete"
WEBUI_SETUP_MARKER="$WEBUI_DIR/node_modules/.ofd_webui_setup"
DOCS_URL="https://github.com/OpenFilamentCollective/open-filament-database/blob/main/docs/installing-software.md"

# Colors for output (if terminal supports it)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Helper functions
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Detect Python command (python3 preferred, then python)
detect_python() {
    if command -v python3 &>/dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &>/dev/null; then
        # Verify it's Python 3
        if python --version 2>&1 | grep -q "Python 3"; then
            PYTHON_CMD="python"
        else
            return 1
        fi
    else
        return 1
    fi
    return 0
}

# Check Python version is >= 3.10
check_python_version() {
    local version=$($PYTHON_CMD -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    local major=$(echo "$version" | cut -d. -f1)
    local minor=$(echo "$version" | cut -d. -f2)

    if [ "$major" -lt 3 ] || ([ "$major" -eq 3 ] && [ "$minor" -lt 10 ]); then
        return 1
    fi
    return 0
}

# Detect npm
detect_npm() {
    command -v npm &>/dev/null
}

# Detect package manager for auto-install
detect_package_manager() {
    # Check for NixOS or nix package manager first
    if [ -n "$IN_NIX_SHELL" ] || [ -f /etc/NIXOS ]; then
        echo "nix"
    elif command -v nix-env &>/dev/null; then
        echo "nix"
    elif command -v apt-get &>/dev/null; then
        echo "apt"
    elif command -v dnf &>/dev/null; then
        echo "dnf"
    elif command -v pacman &>/dev/null; then
        echo "pacman"
    elif command -v zypper &>/dev/null; then
        echo "zypper"
    elif command -v brew &>/dev/null; then
        echo "brew"
    else
        echo "none"
    fi
}

# Try to install Python
try_install_python() {
    local pm=$(detect_package_manager)

    case "$pm" in
        apt)
            info "Attempting to install Python via apt..."
            sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip
            ;;
        dnf)
            info "Attempting to install Python via dnf..."
            sudo dnf install -y python3 python3-pip
            ;;
        pacman)
            info "Attempting to install Python via pacman..."
            sudo pacman -Sy --noconfirm python python-pip
            ;;
        zypper)
            info "Attempting to install Python via zypper..."
            sudo zypper install -y python3 python3-pip python3-venv
            ;;
        nix)
            if [ -n "$IN_NIX_SHELL" ]; then
                warn "Already in a nix-shell. Please add python3 to your shell.nix"
                return 1
            fi
            info "Attempting to install Python via nix-env..."
            nix-env -iA nixpkgs.python3
            ;;
        brew)
            info "Attempting to install Python via Homebrew..."
            brew install python
            ;;
        *)
            return 1
            ;;
    esac
}

# Try to install Node.js
try_install_nodejs() {
    local pm=$(detect_package_manager)

    case "$pm" in
        apt)
            info "Attempting to install Node.js via apt..."
            sudo apt-get update && sudo apt-get install -y nodejs npm
            ;;
        dnf)
            info "Attempting to install Node.js via dnf..."
            sudo dnf install -y nodejs npm
            ;;
        pacman)
            info "Attempting to install Node.js via pacman..."
            sudo pacman -Sy --noconfirm nodejs npm
            ;;
        zypper)
            info "Attempting to install Node.js via zypper..."
            sudo zypper install -y nodejs npm
            ;;
        nix)
            if [ -n "$IN_NIX_SHELL" ]; then
                warn "Already in a nix-shell. Please add nodejs to your shell.nix"
                return 1
            fi
            info "Attempting to install Node.js via nix-env..."
            nix-env -iA nixpkgs.nodejs
            ;;
        brew)
            info "Attempting to install Node.js via Homebrew..."
            brew install node
            ;;
        *)
            return 1
            ;;
    esac
}

# Setup Python virtual environment
setup_venv() {
    if [ ! -d "$VENV_DIR" ]; then
        info "Creating Python virtual environment..."
        $PYTHON_CMD -m venv "$VENV_DIR"
    fi
}

# Activate virtual environment
activate_venv() {
    source "$VENV_DIR/bin/activate"
    PYTHON_CMD="python"
}

# Install Python dependencies
install_python_deps() {
    info "Installing Python dependencies..."
    pip install --upgrade pip
    pip install -r "$REQUIREMENTS_FILE"
    # Install the ofd package in development mode
    pip install -e "$SCRIPT_DIR"
}

# Install Node.js dependencies (only when needed for webui)
install_node_deps() {
    if [ -d "$WEBUI_DIR" ]; then
        info "Installing Node.js dependencies for WebUI..."
        (cd "$WEBUI_DIR" && npm ci)
        touch "$WEBUI_SETUP_MARKER"
        success "Node.js dependencies installed"
    fi
}

# Check if Python setup is complete
is_setup_complete() {
    [ -f "$SETUP_MARKER" ] && [ -d "$VENV_DIR/bin" ]
}

# Check if WebUI setup is complete
is_webui_setup_complete() {
    [ -f "$WEBUI_SETUP_MARKER" ] && [ -d "$WEBUI_DIR/node_modules" ]
}

# Mark setup as complete
mark_setup_complete() {
    touch "$SETUP_MARKER"
}

# Setup Python environment only
run_python_setup() {
    # Check/install Python
    if ! detect_python; then
        warn "Python 3 not found."
        echo -n "Would you like to try installing Python? [y/N] "
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            if try_install_python; then
                detect_python || { error "Failed to install Python. See: $DOCS_URL"; exit 1; }
            else
                error "Could not auto-install Python. Please install manually."
                error "See: $DOCS_URL"
                exit 1
            fi
        else
            error "Python 3 is required."
            error "Please install Python manually from: https://www.python.org/"
            error "Or see: $DOCS_URL"
            exit 1
        fi
    fi

    # Check Python version
    if ! check_python_version; then
        error "Python 3.10+ is required. Current: $($PYTHON_CMD --version)"
        error "Please upgrade Python. See: $DOCS_URL"
        exit 1
    fi

    # Setup Python environment
    setup_venv
    activate_venv
    install_python_deps
    mark_setup_complete
    success "Python environment ready"
}

# Setup WebUI (Node.js) - called only when webui command is used
setup_webui() {
    # Check/install Node.js
    if ! detect_npm; then
        warn "Node.js/npm not found."
        echo -n "Would you like to try installing Node.js? [y/N] "
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            if try_install_nodejs; then
                detect_npm && success "Node.js installed: $(node --version)"
            else
                error "Could not auto-install Node.js."
                error "Please install Node.js manually from: https://nodejs.org/"
                error "Or see: $DOCS_URL"
                exit 1
            fi
        else
            error "Node.js is required for the WebUI."
            error "Please install Node.js from: https://nodejs.org/"
            error "Or see: $DOCS_URL"
            exit 1
        fi
    fi

    # Install Node.js dependencies
    install_node_deps
}

# Run full setup (for explicit 'setup' command)
run_setup() {
    echo "========================================"
    echo "OFD - Setup"
    echo "========================================"
    echo

    # Python setup
    if ! detect_python; then
        warn "Python 3 not found."
        echo -n "Would you like to try installing Python? [y/N] "
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            if try_install_python; then
                detect_python || { error "Failed to install Python. See: $DOCS_URL"; exit 1; }
            else
                error "Could not auto-install Python. Please install manually."
                error "See: $DOCS_URL"
                exit 1
            fi
        else
            error "Python 3 is required."
            error "Please install Python manually from: https://www.python.org/"
            error "Or see: $DOCS_URL"
            exit 1
        fi
    fi
    success "Python found: $($PYTHON_CMD --version)"

    # Check Python version
    if ! check_python_version; then
        error "Python 3.10+ is required. Current: $($PYTHON_CMD --version)"
        error "Please upgrade Python. See: $DOCS_URL"
        exit 1
    fi

    # Setup Python environment
    setup_venv
    activate_venv
    install_python_deps
    mark_setup_complete
    success "Python dependencies installed"

    # Check Node.js status (informational only)
    if ! detect_npm; then
        warn "Node.js/npm not found. WebUI dependencies will be installed when you run './ofd.sh webui'"
    else
        success "Node.js found: $(node --version)"
        info "WebUI dependencies will be installed when you first run './ofd.sh webui'"
    fi

    echo
    success "Setup complete! You can now use: ./ofd.sh <command>"
    echo
}

# Show help
show_help() {
    echo "OFD - Open Filament Database CLI"
    echo
    echo "Usage: ./ofd.sh <command> [options]"
    echo
    echo "Wrapper Commands:"
    echo "  setup       Run first-time setup (install Python dependencies)"
    echo "  --no-setup  Skip auto-setup check"
    echo
    echo "OFD Commands (passed to Python CLI):"
    echo "  validate    Validate data files against schemas"
    echo "  build       Build database exports (JSON, SQLite, CSV, API)"
    echo "  serve       Start development server with CORS"
    echo "  script      Run utility scripts"
    echo "  webui       Start the WebUI development server"
    echo
    echo "Examples:"
    echo "  ./ofd.sh                    # Start WebUI dev server (default)"
    echo "  ./ofd.sh setup              # Run setup manually"
    echo "  ./ofd.sh validate           # Validate all data"
    echo "  ./ofd.sh webui              # Start WebUI dev server"
    echo "  ./ofd.sh build              # Build all exports"
    echo
    echo "Note: Running without arguments starts the WebUI"
    echo "      Node.js dependencies are only installed when you first use 'webui'"
    echo
    echo "Documentation: $DOCS_URL"
}

# Main entry point
main() {
    local skip_setup=false
    local args=()
    local needs_webui=false

    # Parse wrapper-specific arguments and detect webui command
    for arg in "$@"; do
        case "$arg" in
            --no-setup)
                skip_setup=true
                ;;
            setup)
                run_setup
                exit 0
                ;;
            -h|--help)
                if [ ${#args[@]} -eq 0 ]; then
                    show_help
                    exit 0
                else
                    args+=("$arg")
                fi
                ;;
            webui)
                needs_webui=true
                args+=("$arg")
                ;;
            *)
                args+=("$arg")
                ;;
        esac
    done

    # Auto-setup Python on first run (unless --no-setup)
    if [ "$skip_setup" = false ] && ! is_setup_complete; then
        info "First run detected. Setting up Python environment..."
        run_python_setup
    fi

    # Setup WebUI if webui command is used and not yet setup
    if [ "$needs_webui" = true ] && ! is_webui_setup_complete; then
        info "WebUI first run. Setting up Node.js dependencies..."
        setup_webui
    fi

    # Activate venv and run OFD
    if [ -f "$VENV_DIR/bin/activate" ]; then
        activate_venv
    else
        # Fallback if venv doesn't exist but --no-setup was used
        if ! detect_python; then
            error "Python not found and setup was skipped. Run: ./ofd.sh setup"
            exit 1
        fi
    fi

    # If no arguments, default to webui
    if [ ${#args[@]} -eq 0 ]; then
        # Setup WebUI if not yet setup
        if ! is_webui_setup_complete; then
            info "WebUI first run. Setting up Node.js dependencies..."
            setup_webui
        fi
        exec "$PYTHON_CMD" -m ofd webui
    fi

    # Run OFD CLI
    exec "$PYTHON_CMD" -m ofd "${args[@]}"
}

main "$@"
