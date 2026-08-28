#!/bin/bash
set -e

# Prepare quick fix for deployment
# This script packages only the web service changes for quick deployment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build_fix"
PACKAGE_NAME="overleaf-fix.tar.gz"

echo "=========================================="
echo "Preparing Overleaf Fix Package"
echo "=========================================="

# Clean build directory
echo "Cleaning build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/fix"

# Get current git revision
cd "$PROJECT_ROOT"
REVISION=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Building from branch: $BRANCH, revision: $REVISION"

# Warn about uncommitted changes: the image is built from the working tree,
# but VERSION will claim it is $REVISION.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "WARNING: есть незакоммиченные изменения — они попадут в образ, но VERSION будет указывать на $REVISION:"
    git status --short --untracked-files=no | head -20
    echo "Лучше сначала закоммитить (git add -A && git commit). Продолжаю через 5 секунд..."
    sleep 5
fi

# Refresh version.json shown in the UI
"$SCRIPT_DIR/update-version.sh"

# Find existing base image (use any available, prefer latest)
echo "Looking for existing base image..."
EXISTING_BASE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "overleaf-custom-base:" | grep -v "none" | head -n 1)

# Also check sharelatex-base (alternative naming)
if [ -z "$EXISTING_BASE" ]; then
    EXISTING_BASE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "sharelatex/sharelatex-base:" | grep -v "latest" | head -n 1)
fi

if [ -z "$EXISTING_BASE" ]; then
    echo "No existing base image found. Building base image first..."
    echo "This will take ~15-20 minutes..."
    cd "$PROJECT_ROOT/server-ce"
    export MONOREPO_REVISION="$REVISION"
    export BRANCH_NAME="$BRANCH"
    export OVERLEAF_BASE_TAG="overleaf-custom-base:$REVISION"
    export OVERLEAF_TAG="overleaf-custom:$REVISION"
    make build-base
    make build-community
else
    echo "Using existing base image: $EXISTING_BASE"
    # Базовый образ содержит только ОС и Node — npm-пакеты ставятся при сборке образа
    # приложения, поэтому изменения package.json здесь подхватываются. Полная сборка
    # (prepare_install.sh) нужна только при смене версии Node/ОС в Dockerfile-base.
    if ! git diff --quiet "$(git log -1 --format=%H -- server-ce/Dockerfile-base)" HEAD -- server-ce/Dockerfile-base 2>/dev/null; then
        echo "WARNING: server-ce/Dockerfile-base изменён после последнего коммита — базовый образ может быть устаревшим"
    fi
    # Rebuild only web service image using existing base
    cd "$PROJECT_ROOT/server-ce"
    export MONOREPO_REVISION="$REVISION"
    export BRANCH_NAME="$BRANCH"
    export OVERLEAF_BASE_TAG="$EXISTING_BASE"
    export OVERLEAF_TAG="overleaf-custom:$REVISION"
    make build-community
fi

# Save Docker image
echo "Saving Docker image..."
docker save -o "$BUILD_DIR/fix/overleaf-custom.tar" "overleaf-custom:$REVISION"

# Create version file
cat > "$BUILD_DIR/fix/VERSION" << EOF
REVISION=$REVISION
BRANCH=$BRANCH
BUILD_DATE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
FIX_TYPE=web-service-only
EOF

# Include server-side scripts so the package is self-contained
mkdir -p "$BUILD_DIR/fix/scripts"
cp "$SCRIPT_DIR/backup/overleaf-backup.sh" "$BUILD_DIR/fix/scripts/"
cp "$SCRIPT_DIR/backup/BACKUP_RU.md" "$BUILD_DIR/fix/scripts/"
cp "$SCRIPT_DIR/install_fix.sh" "$BUILD_DIR/fix/scripts/"
cp "$SCRIPT_DIR/install_fix.sh" "$BUILD_DIR/"          # рядом с пакетом — его копируют на сервер вместе с архивом
chmod +x "$BUILD_DIR/fix/scripts/"*.sh "$BUILD_DIR/install_fix.sh"

# Package everything
echo "Creating fix package..."
cd "$BUILD_DIR"
# Exclude macOS metadata files
export COPYFILE_DISABLE=1
tar --exclude='._*' --exclude='.DS_Store' -czf "$PACKAGE_NAME" fix/
mv "$PACKAGE_NAME" "$PROJECT_ROOT/"

# Keep the image locally (useful for smoke tests); remove with CLEANUP_AFTER=true
if [ "${CLEANUP_AFTER:-false}" = "true" ]; then
    docker rmi "overleaf-custom:$REVISION" 2>/dev/null || true
fi
cp "$SCRIPT_DIR/install_fix.sh" "$PROJECT_ROOT/install_fix.sh"

echo "=========================================="
echo "Fix package complete!"
echo "Package created: $PROJECT_ROOT/$PACKAGE_NAME"
echo "Size: $(du -h "$PROJECT_ROOT/$PACKAGE_NAME" | cut -f1)"
echo "=========================================="
echo ""
echo "Build info:"
echo "  Revision: $REVISION"
echo "  Branch: $BRANCH"
echo "  Type: Web service only (quick fix)"
echo ""
echo "To deploy (see ОБНОВЛЕНИЕ.md):"
echo "  scp $PACKAGE_NAME install_fix.sh USER@SERVER:~/"
echo "  ssh USER@SERVER 'bash ~/install_fix.sh ~/$PACKAGE_NAME'"
echo ""
