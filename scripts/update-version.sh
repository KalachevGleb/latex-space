#!/bin/bash
# This script generates version.json with current git commit information
# It should be run after each commit to keep the version info up to date

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$PROJECT_ROOT/services/web/public/version.json"

# Get git information
COMMIT_HASH=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
COMMIT_SHORT=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_DATE=$(git -C "$PROJECT_ROOT" log -1 --format=%cd --date=iso 2>/dev/null || date -Iseconds)
BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Repository URL - this will be updated when fork is created
# TODO: Update this URL after creating GitHub fork
REPO_URL="https://github.com/KalachevGleb/latex-space"

# Ensure directory exists
mkdir -p "$(dirname "$VERSION_FILE")"

# Generate version.json
cat > "$VERSION_FILE" <<EOF
{
  "commit": "$COMMIT_HASH",
  "commitShort": "$COMMIT_SHORT",
  "commitDate": "$COMMIT_DATE",
  "branch": "$BRANCH",
  "repoUrl": "$REPO_URL",
  "generatedAt": "$(date -Iseconds)"
}
EOF

echo "✓ Version updated: $COMMIT_SHORT (branch: $BRANCH)"
echo "  File: $VERSION_FILE"
