#!/bin/bash
set -e

# Install Overleaf Custom Edition
# This script unpacks and deploys Overleaf on a target server

SCRIPT_NAME=$(basename "$0")
INSTALL_DIR=""  # Will be set from config or default
DEFAULT_INSTALL_DIR="/opt/overleaf"
ARCHIVE_FILE=""
CONFIG_FILE=""

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
Usage: $SCRIPT_NAME <archive.tar.gz> <config.json> [options]

Arguments:
  archive.tar.gz    Path to Overleaf package archive
  config.json       Path to configuration file (must include installDir)

Options:
  --install-dir DIR Install to custom directory (overrides config.json)
  --no-start        Don't start services after installation
  --help            Show this help message

Example:
  $SCRIPT_NAME overleaf-custom.tar.gz overleaf_config.json
  $SCRIPT_NAME overleaf-custom.tar.gz config.json --install-dir /srv/overleaf

Note: Install directory is read from config.json (installDir field) or can be
      overridden with --install-dir. Default is $DEFAULT_INSTALL_DIR if not specified.

EOF
    exit 0
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
    fi

    if ! docker info &> /dev/null; then
        error "Docker daemon is not running or current user doesn't have permission to access it."
    fi

    info "Docker is available: $(docker --version)"
}

# Check if Docker Compose is installed
check_docker_compose() {
    if ! docker compose version &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
    fi

    info "Docker Compose is available: $(docker compose version)"
}

# Parse JSON config file and export as environment variables
parse_config() {
    local config_file="$1"

    if [ ! -f "$config_file" ]; then
        error "Configuration file not found: $config_file"
    fi

    info "Parsing configuration file..."

    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        warn "jq is not installed. Using basic parsing (may not work with complex configs)."
        return
    fi

    # Read install directory from config if not set via command line
    if [ -z "$INSTALL_DIR" ]; then
        INSTALL_DIR=$(jq -r '.installDir // ""' "$config_file")
        if [ -z "$INSTALL_DIR" ]; then
            warn "No installDir in config. Using default: $DEFAULT_INSTALL_DIR"
            INSTALL_DIR="$DEFAULT_INSTALL_DIR"
        fi
    fi

    # Export configuration as environment variables
    export OVERLEAF_SITE_URL=$(jq -r '.siteUrl // "http://localhost"' "$config_file")
    export OVERLEAF_APP_NAME=$(jq -r '.appName // "Overleaf"' "$config_file")
    export OVERLEAF_NAV_TITLE=$(jq -r '.customization.navTitle // .appName // "Overleaf"' "$config_file")
    export OVERLEAF_ADMIN_EMAIL=$(jq -r '.adminEmail // "admin@example.com"' "$config_file")
    export OVERLEAF_PORT=$(jq -r '.port // 80' "$config_file")
    export OVERLEAF_DATA_DIR=$(jq -r '.dataDir // "./data"' "$config_file")

    # Email configuration
    export OVERLEAF_EMAIL_FROM_ADDRESS=$(jq -r '.email.fromAddress // ""' "$config_file")
    export OVERLEAF_EMAIL_REPLY_TO=$(jq -r '.email.replyTo // ""' "$config_file")
    export OVERLEAF_EMAIL_SMTP_HOST=$(jq -r '.email.smtp.host // ""' "$config_file")
    export OVERLEAF_EMAIL_SMTP_PORT=$(jq -r '.email.smtp.port // 587' "$config_file")
    export OVERLEAF_EMAIL_SMTP_SECURE=$(jq -r '.email.smtp.secure // false' "$config_file")
    export OVERLEAF_EMAIL_SMTP_USER=$(jq -r '.email.smtp.user // ""' "$config_file")
    export OVERLEAF_EMAIL_SMTP_PASS=$(jq -r '.email.smtp.pass // ""' "$config_file")

    # Security
    export OVERLEAF_SECURE_COOKIE=$(jq -r '.security.secureCookie // ""' "$config_file")
    export OVERLEAF_SESSION_SECRET=$(jq -r '.security.sessionSecret // ""' "$config_file")

    # Customization
    export OVERLEAF_HEADER_IMAGE_URL=$(jq -r '.customization.headerImageUrl // ""' "$config_file")

    # Features
    export EMAIL_CONFIRMATION_DISABLED=$(jq -r '.features.emailConfirmationDisabled // true' "$config_file")

    # Generate session secret if not provided
    if [ -z "$OVERLEAF_SESSION_SECRET" ]; then
        warn "No session secret provided. Generating random secret..."
        export OVERLEAF_SESSION_SECRET=$(openssl rand -hex 32)
    fi

    # Convert relative data dir to absolute
    if [[ ! "$OVERLEAF_DATA_DIR" = /* ]]; then
        export OVERLEAF_DATA_DIR="$INSTALL_DIR/$OVERLEAF_DATA_DIR"
    fi

    info "Configuration loaded successfully"
}

# Parse command line arguments
START_SERVICES=true
while [[ $# -gt 0 ]]; do
    case $1 in
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --no-start)
            START_SERVICES=false
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

# Main installation process
echo "=========================================="
echo "Installing Overleaf Custom Edition"
echo "=========================================="
echo "Archive:     $ARCHIVE_FILE"
echo "Config:      $CONFIG_FILE"
echo "Install dir: $INSTALL_DIR"
echo "=========================================="

# Check prerequisites
check_docker
check_docker_compose

# Parse configuration
parse_config "$CONFIG_FILE"

# Create installation directory
info "Creating installation directory..."
if [ -w "$(dirname "$INSTALL_DIR")" ] 2>/dev/null || mkdir -p "$INSTALL_DIR" 2>/dev/null; then
    # No sudo needed - we have write permission
    mkdir -p "$INSTALL_DIR"
else
    # Need sudo for system directories
    info "Installation directory requires elevated privileges, using sudo..."
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown "$(whoami):$(whoami)" "$INSTALL_DIR"
fi

# Extract archive
info "Extracting archive..."
tar -xzf "$ARCHIVE_FILE" -C "$INSTALL_DIR" --strip-components=1

# Create data directories
info "Creating data directories..."
mkdir -p "$OVERLEAF_DATA_DIR"
mkdir -p "$OVERLEAF_DATA_DIR/sharelatex_data"
mkdir -p "$OVERLEAF_DATA_DIR/mongo_data"
mkdir -p "$OVERLEAF_DATA_DIR/redis_data"
mkdir -p "$OVERLEAF_DATA_DIR/texlive-cache"

# Load Docker images
info "Loading Docker images (this may take several minutes)..."
docker load -i "$INSTALL_DIR/overleaf-custom-base.tar"
docker load -i "$INSTALL_DIR/overleaf-custom.tar"
docker load -i "$INSTALL_DIR/texlive-full.tar"
docker load -i "$INSTALL_DIR/mongo.tar"
docker load -i "$INSTALL_DIR/redis.tar"

# Tag images for docker-compose
info "Tagging Docker images..."
OVERLEAF_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "overleaf-custom:" | grep -v "base" | head -n 1)
docker tag "$OVERLEAF_IMAGE" "overleaf-custom:latest"

# Create .env file
info "Creating environment file..."
cat > "$INSTALL_DIR/.env" << EOF
# Overleaf Configuration
OVERLEAF_SITE_URL=$OVERLEAF_SITE_URL
OVERLEAF_APP_NAME=$OVERLEAF_APP_NAME
OVERLEAF_NAV_TITLE=$OVERLEAF_NAV_TITLE
OVERLEAF_ADMIN_EMAIL=$OVERLEAF_ADMIN_EMAIL
OVERLEAF_PORT=$OVERLEAF_PORT
OVERLEAF_DATA_DIR=$OVERLEAF_DATA_DIR

# Session Secret
OVERLEAF_SESSION_SECRET=$OVERLEAF_SESSION_SECRET

# Features
EMAIL_CONFIRMATION_DISABLED=$EMAIL_CONFIRMATION_DISABLED
EOF

# Add optional settings only if they have values
# (empty values can cause issues with some settings like SECURE_COOKIE)
[ -n "$OVERLEAF_EMAIL_FROM_ADDRESS" ] && echo "OVERLEAF_EMAIL_FROM_ADDRESS=$OVERLEAF_EMAIL_FROM_ADDRESS" >> "$INSTALL_DIR/.env"
[ -n "$OVERLEAF_EMAIL_REPLY_TO" ] && echo "OVERLEAF_EMAIL_REPLY_TO=$OVERLEAF_EMAIL_REPLY_TO" >> "$INSTALL_DIR/.env"
[ -n "$OVERLEAF_EMAIL_SMTP_HOST" ] && echo "OVERLEAF_EMAIL_SMTP_HOST=$OVERLEAF_EMAIL_SMTP_HOST" >> "$INSTALL_DIR/.env"
[ -n "$OVERLEAF_EMAIL_SMTP_PORT" ] && echo "OVERLEAF_EMAIL_SMTP_PORT=$OVERLEAF_EMAIL_SMTP_PORT" >> "$INSTALL_DIR/.env"
[ -n "$OVERLEAF_EMAIL_SMTP_SECURE" ] && echo "OVERLEAF_EMAIL_SMTP_SECURE=$OVERLEAF_EMAIL_SMTP_SECURE" >> "$INSTALL_DIR/.env"
[ -n "$OVERLEAF_EMAIL_SMTP_USER" ] && echo "OVERLEAF_EMAIL_SMTP_USER=$OVERLEAF_EMAIL_SMTP_USER" >> "$INSTALL_DIR/.env"
[ -n "$OVERLEAF_EMAIL_SMTP_PASS" ] && echo "OVERLEAF_EMAIL_SMTP_PASS=$OVERLEAF_EMAIL_SMTP_PASS" >> "$INSTALL_DIR/.env"
[ -n "$OVERLEAF_SECURE_COOKIE" ] && echo "OVERLEAF_SECURE_COOKIE=$OVERLEAF_SECURE_COOKIE" >> "$INSTALL_DIR/.env"
[ -n "$OVERLEAF_HEADER_IMAGE_URL" ] && echo "OVERLEAF_HEADER_IMAGE_URL=$OVERLEAF_HEADER_IMAGE_URL" >> "$INSTALL_DIR/.env"

# Save configuration for future reference
cp "$CONFIG_FILE" "$INSTALL_DIR/overleaf_config.json"

# Start services if requested
if [ "$START_SERVICES" = true ]; then
    info "Starting Overleaf services..."
    cd "$INSTALL_DIR"
    docker compose up -d

    info "Waiting for services to be ready..."
    sleep 10

    # Check if services are running
    if docker compose ps | grep -q "Up"; then
        info "Services started successfully!"
        echo ""
        echo "=========================================="
        echo "Installation complete!"
        echo "=========================================="
        echo "Overleaf is now running at: $OVERLEAF_SITE_URL"
        echo ""
        echo "Next steps:"
        echo "1. Open $OVERLEAF_SITE_URL/launchpad in your browser"
        echo "2. Create the first admin account"
        echo "3. Start using Overleaf!"
        echo ""
        echo "Useful commands:"
        echo "  Start:   cd $INSTALL_DIR && docker compose up -d"
        echo "  Stop:    cd $INSTALL_DIR && docker compose down"
        echo "  Logs:    cd $INSTALL_DIR && docker compose logs -f"
        echo "  Restart: cd $INSTALL_DIR && docker compose restart"
        echo "=========================================="
    else
        error "Some services failed to start. Check logs with: cd $INSTALL_DIR && docker compose logs"
    fi
else
    info "Installation complete (services not started)"
    echo ""
    echo "To start services manually:"
    echo "  cd $INSTALL_DIR && docker compose up -d"
fi
