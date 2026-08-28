#!/bin/bash
set -e

# Собирает МАЛЕНЬКИЙ пакет только со служебными скриптами сервера
# (install_fix.sh, overleaf-backup.sh, инструкция). Docker не нужен, секунды.
# Результат: overleaf-scripts.tar.gz и install_fix.sh в корне проекта.
#
# Когда использовать: изменились только скрипты (бэкап/установщик), а код
# приложения — нет. Тогда на сервер заливается ~50 КБ вместо ~600 МБ.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build_scripts"
PACKAGE_NAME="overleaf-scripts.tar.gz"

cd "$PROJECT_ROOT"
REVISION=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

rm -rf "$BUILD_DIR"; mkdir -p "$BUILD_DIR/scripts"
cp "$SCRIPT_DIR/install_fix.sh" "$SCRIPT_DIR/backup/overleaf-backup.sh" "$SCRIPT_DIR/backup/BACKUP_RU.md" "$BUILD_DIR/scripts/"
chmod +x "$BUILD_DIR/scripts/"*.sh
cat > "$BUILD_DIR/scripts/VERSION" << EOF
REVISION=$REVISION
BRANCH=$BRANCH
BUILD_DATE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
FIX_TYPE=scripts-only
EOF

cd "$BUILD_DIR"
export COPYFILE_DISABLE=1
tar --no-xattrs --exclude='._*' --exclude='.DS_Store' -czf "$PACKAGE_NAME" scripts/ 2>/dev/null \
  || tar --exclude='._*' --exclude='.DS_Store' -czf "$PACKAGE_NAME" scripts/
mv "$PACKAGE_NAME" "$PROJECT_ROOT/"
cp "$SCRIPT_DIR/install_fix.sh" "$PROJECT_ROOT/install_fix.sh"
rm -rf "$BUILD_DIR"

echo "Пакет скриптов: $PROJECT_ROOT/$PACKAGE_NAME ($(du -h "$PROJECT_ROOT/$PACKAGE_NAME" | cut -f1)), ревизия ${REVISION:0:10}"
echo "На сервер:  rsync -avz --progress $PACKAGE_NAME install_fix.sh USER@SERVER:~/"
echo "На сервере: bash ~/install_fix.sh ~/$PACKAGE_NAME            (только скрипты)"
echo "            bash ~/install_fix.sh ~/$PACKAGE_NAME ~/overleaf-fix.tar.gz   (скрипты + образ)"
