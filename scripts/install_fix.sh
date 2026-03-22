#!/bin/bash
set -e

# Install Overleaf Fix (web service only)
# This script updates only the web service container

SCRIPT_NAME=$(basename "$0")
ARCHIVE_FILE=""
CONFIG_FILE=""
INSTALL_DIR=""
DEFAULT_INSTALL_DIR="/opt/overleaf"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    exit 1
}

info() {
    echo -e "${GREEN}INFO: $1${NC}"
}

warn() {
    echo -e "${YELLOW}WARNING: $1${NC}"
}

usage() {
    cat << EOF
Usage: $SCRIPT_NAME <fix-archive.tar.gz> <config.json> [options]

Arguments:
  fix-archive.tar.gz    Path to Overleaf fix package
  config.json           Path to configuration file (same as used for install_overleaf.sh)

Options:
  --install-dir DIR     Override installation directory from config
  --no-restart          Don't restart services after update
  --help                Show this help message

Example:
  $SCRIPT_NAME overleaf-fix.tar.gz overleaf_config.json
  $SCRIPT_NAME overleaf-fix.tar.gz config.json --install-dir /opt/overleaf

Note: This script assumes Overleaf is already installed via install_overleaf.sh
EOF
    exit 0
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed."
    fi

    if ! docker info &> /dev/null; then
        error "Docker daemon is not running or current user doesn't have permission."
    fi
}

# Parse JSON config file using Python (same as install_overleaf.sh)
parse_json() {
    local config_file="$1"
    local key_path="$2"
    local default_value="$3"

    python3 -c "
import json, sys
try:
    with open('$config_file') as f:
        data = json.load(f)
    keys = '$key_path'.split('.')
    value = data
    for key in keys:
        if isinstance(value, dict) and key in value:
            value = value[key]
        else:
            value = None
            break
    if value is None or value == '':
        print('$default_value')
    elif isinstance(value, bool):
        print(str(value).lower())
    else:
        print(value)
except:
    print('$default_value')
" 2>/dev/null
}

# Parse configuration
parse_config() {
    local config_file="$1"

    if [ ! -f "$config_file" ]; then
        error "Configuration file not found: $config_file"
    fi

    if ! command -v python3 &> /dev/null; then
        error "Python3 is required but not installed."
    fi

    info "Parsing configuration file..."

    # Read install directory from config if not set via command line
    if [ -z "$INSTALL_DIR" ]; then
        INSTALL_DIR=$(parse_json "$config_file" "installDir" "")
        if [ -z "$INSTALL_DIR" ]; then
            warn "No installDir in config. Using default: $DEFAULT_INSTALL_DIR"
            INSTALL_DIR="$DEFAULT_INSTALL_DIR"
        fi
    fi

    info "Installation directory: $INSTALL_DIR"
}

# Parse command line arguments
RESTART_SERVICES=true
while [[ $# -gt 0 ]]; do
    case $1 in
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --no-restart)
            RESTART_SERVICES=false
            shift
            ;;
        --help)
            usage
            ;;
        -*)
            error "Unknown option: $1"
            ;;
        *)
            if [ -z "$ARCHIVE_FILE" ]; then
                ARCHIVE_FILE="$1"
            elif [ -z "$CONFIG_FILE" ]; then
                CONFIG_FILE="$1"
            else
                error "Too many arguments"
            fi
            shift
            ;;
    esac
done

# Validate arguments
if [ -z "$ARCHIVE_FILE" ] || [ -z "$CONFIG_FILE" ]; then
    error "Missing required arguments. Use --help for usage information."
fi

if [ ! -f "$ARCHIVE_FILE" ]; then
    error "Archive file not found: $ARCHIVE_FILE"
fi

if [ ! -f "$CONFIG_FILE" ]; then
    error "Configuration file not found: $CONFIG_FILE"
fi

# Main update process
echo "=========================================="
echo "Installing Overleaf Fix"
echo "=========================================="
echo "Archive: $ARCHIVE_FILE"
echo "Config:  $CONFIG_FILE"
echo "=========================================="

# Check prerequisites
check_docker

# Parse configuration to get install directory
parse_config "$CONFIG_FILE"

if [ ! -d "$INSTALL_DIR" ]; then
    error "Installation directory not found: $INSTALL_DIR. Is Overleaf installed?"
fi

if [ ! -f "$INSTALL_DIR/docker-compose.yml" ]; then
    error "docker-compose.yml not found in $INSTALL_DIR. Is Overleaf installed?"
fi

echo "Install dir: $INSTALL_DIR"
echo "=========================================="

# Create temporary directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract archive
info "Extracting fix package..."
tar -xzf "$ARCHIVE_FILE" -C "$TEMP_DIR" --strip-components=1

# Stop running container before updating
if [ "$RESTART_SERVICES" = true ]; then
    info "Stopping sharelatex container..."
    cd "$INSTALL_DIR"
    docker compose stop sharelatex || warn "Container was not running"
fi

# Load new Docker image
info "Loading updated Docker image..."
docker load -i "$TEMP_DIR/overleaf-custom.tar"

# Tag image for docker-compose
info "Tagging Docker image..."
OVERLEAF_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "overleaf-custom:" | grep -v "base" | head -n 1)
docker tag "$OVERLEAF_IMAGE" "overleaf-custom:latest"

# Display version info
if [ -f "$TEMP_DIR/VERSION" ]; then
    info "Fix version information:"
    cat "$TEMP_DIR/VERSION" | sed 's/^/  /'
fi

# Restart service if requested
if [ "$RESTART_SERVICES" = true ]; then
    info "Starting sharelatex container..."
    cd "$INSTALL_DIR"
    docker compose up -d sharelatex

    info "Waiting for service to be ready..."
    sleep 5

    # Check if service is running
    if docker compose ps sharelatex | grep -q "Up"; then
        info "Service restarted successfully!"
        echo ""
        echo "=========================================="
        echo "Fix installed successfully!"
        echo "=========================================="
        echo ""
        echo "Useful commands:"
        echo "  Logs:    cd $INSTALL_DIR && docker compose logs -f sharelatex"
        echo "  Restart: cd $INSTALL_DIR && docker compose restart sharelatex"
        echo "  Status:  cd $INSTALL_DIR && docker compose ps"
        echo ""
        echo "Updated Docker image:"
        docker images | grep "overleaf-custom" | grep -v "base" | head -1
        echo "=========================================="
    else
        error "Service failed to start. Check logs with: cd $INSTALL_DIR && docker compose logs sharelatex"
    fi
else
    info "Fix installed (service not restarted)"
    echo ""
    echo "To restart service manually:"
    echo "  cd $INSTALL_DIR && docker compose up -d sharelatex"
fi
