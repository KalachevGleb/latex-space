#!/bin/bash
set -e

# Prepare Overleaf Custom Edition for deployment
# This script packages everything needed for production deployment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
PACKAGE_NAME="overleaf-custom.tar.gz"

# Options
SKIP_TEXLIVE="${SKIP_TEXLIVE:-false}"
SKIP_BASE_DEPS="${SKIP_BASE_DEPS:-false}"
CLEANUP_AFTER="${CLEANUP_AFTER:-false}"

echo "=========================================="
echo "Preparing Overleaf Custom Edition for deployment"
echo "=========================================="
echo "Options:"
echo "  SKIP_TEXLIVE=${SKIP_TEXLIVE} (set to 'true' to skip TexLive build)"
echo "  SKIP_BASE_DEPS=${SKIP_BASE_DEPS} (set to 'true' to skip mongo/redis)"
echo "  CLEANUP_AFTER=${CLEANUP_AFTER} (set to 'false' to keep images)"
echo "=========================================="

# Clean build directory
echo "Cleaning build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/deployment"

# Get current git revision
cd "$PROJECT_ROOT"
REVISION=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Building from branch: $BRANCH, revision: $REVISION"

# Build Docker images
echo "Building Docker images..."
cd "$PROJECT_ROOT/server-ce"

# Build base image
echo "Building base image..."
export MONOREPO_REVISION="$REVISION"
export BRANCH_NAME="$BRANCH"
export OVERLEAF_BASE_TAG="overleaf-custom-base:$REVISION"
export OVERLEAF_TAG="overleaf-custom:$REVISION"

make build-base
make build-community

# Build TexLive image for sandboxed compiles
if [ "$SKIP_TEXLIVE" = "true" ]; then
    echo "Skipping TexLive build (SKIP_TEXLIVE=true)"
    echo "NOTE: Using existing texlive-full image from previous build"
elif docker image inspect texlive-full &>/dev/null; then
    echo "TexLive image already exists locally, skipping build"
    echo "NOTE: Run with SKIP_TEXLIVE=rebuild to force rebuild"
else
    echo "Building TexLive image (this takes ~1 hour)..."
    cd "$PROJECT_ROOT/develop"
    docker build texlive -t texlive-full
fi

# Pull base dependencies if needed
if [ "$SKIP_BASE_DEPS" = "true" ]; then
    echo "Skipping MongoDB/Redis pull (SKIP_BASE_DEPS=true)"
else
    if docker image inspect mongo:6.0 &>/dev/null; then
        echo "MongoDB image already exists locally, skipping pull"
    else
        echo "Pulling MongoDB image..."
        docker pull mongo:6.0
    fi

    if docker image inspect redis:6.2 &>/dev/null; then
        echo "Redis image already exists locally, skipping pull"
    else
        echo "Pulling Redis image..."
        docker pull redis:6.2
    fi
fi

# Save Docker images to tar files
echo "Saving Docker images..."
docker save -o "$BUILD_DIR/deployment/overleaf-custom-base.tar" "overleaf-custom-base:$REVISION"
docker save -o "$BUILD_DIR/deployment/overleaf-custom.tar" "overleaf-custom:$REVISION"

# Save texlive-full (required for compilation)
# SKIP_TEXLIVE only skips building, but image must exist from previous build
if docker image inspect texlive-full &>/dev/null; then
    docker save -o "$BUILD_DIR/deployment/texlive-full.tar" texlive-full
else
    echo "ERROR: texlive-full image not found!"
    echo "Cannot create deployment package without TexLive."
    echo "Run without SKIP_TEXLIVE=true first to build the image."
    exit 1
fi

# Save mongo/redis (required)
# SKIP_BASE_DEPS only skips pulling, but images must exist from previous build or registry
if docker image inspect mongo:6.0 &>/dev/null; then
    docker save -o "$BUILD_DIR/deployment/mongo.tar" mongo:6.0
else
    echo "ERROR: mongo:6.0 image not found! Run without SKIP_BASE_DEPS=true first."
    exit 1
fi

if docker image inspect redis:6.2 &>/dev/null; then
    docker save -o "$BUILD_DIR/deployment/redis.tar" redis:6.2
else
    echo "ERROR: redis:6.2 image not found! Run without SKIP_BASE_DEPS=true first."
    exit 1
fi

# Copy deployment files
echo "Copying deployment files..."
mkdir -p "$BUILD_DIR/deployment/config"

# Create deployment docker-compose.yml
cat > "$BUILD_DIR/deployment/docker-compose.yml" << 'EOF'
services:
    sharelatex:
        restart: always
        image: overleaf-custom:latest
        container_name: sharelatex
        depends_on:
            mongo:
                condition: service_healthy
            redis:
                condition: service_started
        ports:
            - "${OVERLEAF_PORT:-80}:80"
        stop_grace_period: 60s
        volumes:
            - ${OVERLEAF_DATA_DIR:-./data}/sharelatex_data:/var/lib/overleaf
            - ${OVERLEAF_DATA_DIR:-./data}/texlive-cache:/overleaf/services/clsi/texlive-cache
            - /var/run/docker.sock:/var/run/docker.sock
        environment:
            OVERLEAF_APP_NAME: ${OVERLEAF_APP_NAME:-Overleaf}
            OVERLEAF_SITE_URL: ${OVERLEAF_SITE_URL:-http://localhost}
            OVERLEAF_NAV_TITLE: ${OVERLEAF_NAV_TITLE:-Overleaf}

            OVERLEAF_MONGO_URL: mongodb://mongo/sharelatex
            OVERLEAF_REDIS_HOST: redis
            REDIS_HOST: redis

            # Email configuration
            OVERLEAF_EMAIL_FROM_ADDRESS: ${OVERLEAF_EMAIL_FROM_ADDRESS:-}
            OVERLEAF_EMAIL_REPLY_TO: ${OVERLEAF_EMAIL_REPLY_TO:-}
            OVERLEAF_EMAIL_SMTP_HOST: ${OVERLEAF_EMAIL_SMTP_HOST:-}
            OVERLEAF_EMAIL_SMTP_PORT: ${OVERLEAF_EMAIL_SMTP_PORT:-587}
            OVERLEAF_EMAIL_SMTP_SECURE: ${OVERLEAF_EMAIL_SMTP_SECURE:-false}
            OVERLEAF_EMAIL_SMTP_USER: ${OVERLEAF_EMAIL_SMTP_USER:-}
            OVERLEAF_EMAIL_SMTP_PASS: ${OVERLEAF_EMAIL_SMTP_PASS:-}

            # Admin email
            OVERLEAF_ADMIN_EMAIL: ${OVERLEAF_ADMIN_EMAIL:-admin@example.com}

            # Optional: Custom header logo
            OVERLEAF_HEADER_IMAGE_URL: ${OVERLEAF_HEADER_IMAGE_URL:-}

            # Security - session secret (both formats for compatibility)
            SESSION_SECRET: ${OVERLEAF_SESSION_SECRET:-}
            OVERLEAF_SESSION_SECRET: ${OVERLEAF_SESSION_SECRET:-}

            # Cookie settings for API access
            COOKIE_DOMAIN: ${COOKIE_DOMAIN:-}
            OVERLEAF_SECURE_COOKIE: ${OVERLEAF_SECURE_COOKIE:-}
            ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-}

            # Features
            ENABLED_LINKED_FILE_TYPES: 'project_file,project_output_file'
            ENABLE_CONVERSIONS: 'true'
            EMAIL_CONFIRMATION_DISABLED: ${EMAIL_CONFIRMATION_DISABLED:-true}

            # Sandboxed compiles (Server Pro feature)
            SANDBOXED_COMPILES: 'true'
            SANDBOXED_COMPILES_HOST_DIR_COMPILES: '${OVERLEAF_DATA_DIR:-./data}/sharelatex_data/data/compiles'
            SANDBOXED_COMPILES_HOST_DIR_OUTPUT: '${OVERLEAF_DATA_DIR:-./data}/sharelatex_data/data/output'
            SANDBOXED_COMPILES_HOST_DIR_TEXLIVE_CACHE: '${OVERLEAF_DATA_DIR:-./data}/texlive-cache'
            DOCKER_RUNNER: 'true'
            SANDBOXED_COMPILES_SIBLING_CONTAINERS: 'true'
            TEXLIVE_IMAGE: 'texlive-full'
            TEX_LIVE_DOCKER_IMAGE: 'texlive-full'
            ALL_TEX_LIVE_DOCKER_IMAGES: 'texlive-full'

    mongo:
        restart: always
        image: mongo:6.0
        container_name: mongo
        command: '--replSet overleaf'
        volumes:
            - ${OVERLEAF_DATA_DIR:-./data}/mongo_data:/data/db
            - ./bin/mongodb-init-replica-set.js:/docker-entrypoint-initdb.d/mongodb-init-replica-set.js
        environment:
          MONGO_INITDB_DATABASE: sharelatex
        extra_hosts:
          - mongo:127.0.0.1
        healthcheck:
            test: echo 'db.stats().ok' | mongosh localhost:27017/test --quiet
            interval: 10s
            timeout: 10s
            retries: 5

    redis:
        restart: always
        image: redis:6.2
        container_name: redis
        volumes:
            - ${OVERLEAF_DATA_DIR:-./data}/redis_data:/data
EOF

# Copy MongoDB init script
mkdir -p "$BUILD_DIR/deployment/bin"
cat > "$BUILD_DIR/deployment/bin/mongodb-init-replica-set.js" << 'EOF'
print('BEGIN: Initializing replica set');
try {
  rs.initiate({ _id: 'overleaf', members: [{ _id: 0, host: 'mongo:27017' }]});
  print('END: Initialized replica set');
} catch (error) {
  if (error.codeName === 'AlreadyInitialized') {
    print('SKIP: Replica set already initialized');
  } else {
    print('ERROR: ' + error.message);
    throw error;
  }
}
EOF

# Create version file
cat > "$BUILD_DIR/deployment/VERSION" << EOF
REVISION=$REVISION
BRANCH=$BRANCH
BUILD_DATE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
EOF

# Create sample configuration file
cat > "$BUILD_DIR/deployment/overleaf_config.json.example" << 'EOF'
{
  "siteUrl": "http://localhost",
  "appName": "Overleaf",
  "adminEmail": "admin@example.com",
  "port": 80,
  "dataDir": "./data",
  "email": {
    "fromAddress": "noreply@example.com",
    "replyTo": "support@example.com",
    "smtp": {
      "host": "smtp.example.com",
      "port": 587,
      "secure": false,
      "user": "",
      "pass": ""
    }
  },
  "security": {
    "secureCookie": false,
    "sessionSecret": ""
  },
  "customization": {
    "navTitle": "Overleaf",
    "headerImageUrl": ""
  },
  "features": {
    "emailConfirmationDisabled": true
  }
}
EOF

# Package everything
echo "Creating package archive..."
cd "$BUILD_DIR"
# Exclude macOS metadata files
export COPYFILE_DISABLE=1
tar --exclude='._*' --exclude='.DS_Store' -czf "$PACKAGE_NAME" deployment/
mv "$PACKAGE_NAME" "$PROJECT_ROOT/"

# Cleanup Docker images if requested
if [ "$CLEANUP_AFTER" = "true" ]; then
    echo "Cleaning up Docker images..."
    docker rmi "overleaf-custom-base:$REVISION" 2>/dev/null || true
    docker rmi "overleaf-custom:$REVISION" 2>/dev/null || true
    echo "Kept: texlive-full, mongo:6.0, redis:6.2 (for reuse)"
else
    echo "Keeping Docker images for future use (base + community)"
    echo "  overleaf-custom-base:$REVISION"
    echo "  overleaf-custom:$REVISION"
fi

echo "=========================================="
echo "Build complete!"
echo "Package created: $PROJECT_ROOT/$PACKAGE_NAME"
echo "Size: $(du -h "$PROJECT_ROOT/$PACKAGE_NAME" | cut -f1)"
echo "=========================================="
echo ""
echo "Build info:"
echo "  Revision: $REVISION"
echo "  Branch: $BRANCH"
echo "  TexLive included: $([ "$SKIP_TEXLIVE" = "true" ] && echo "NO" || echo "YES")"
echo "  Base deps included: $([ "$SKIP_BASE_DEPS" = "true" ] && echo "NO" || echo "YES")"
echo ""
echo "To deploy:"
echo "  1. Copy $PACKAGE_NAME to target server"
echo "  2. Run: ./install_overleaf.sh $PACKAGE_NAME overleaf_config.json"
echo ""
echo "For faster rebuilds during development:"
echo "  SKIP_TEXLIVE=true ./scripts/prepare_install.sh"
echo ""
