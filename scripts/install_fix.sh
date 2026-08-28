#!/bin/bash
set -e

# =============================================================================
#  install_fix.sh — обновление LaTeXSpace на сервере (только образ приложения)
#
#  Использование:
#    ./install_fix.sh overleaf-fix.tar.gz              обновить
#    ./install_fix.sh --rollback                       вернуть предыдущую версию
#    ./install_fix.sh overleaf-fix.tar.gz --no-backup  обновить без резервной копии (не рекомендуется)
#
#  Что делает при обновлении:
#    1. делает резервную копию (scripts/overleaf-backup.sh backup --stop), сервис остаётся выключенным
#    2. запоминает текущий образ как overleaf-custom:previous (для отката)
#    3. загружает новый образ, помечает его overleaf-custom:latest
#    4. запускает сервис и ждёт, пока он ответит
#    5. обновляет файл VERSION в каталоге установки
#
#  Конфигурация (.env, docker-compose.yml, overleaf_config.json) и данные НЕ трогаются.
#  Каталог установки определяется автоматически (по installDir из overleaf_config.json
#  рядом со скриптом, ~/latexspace, /opt/overleaf), либо задаётся: --install-dir ПУТЬ
# =============================================================================

SCRIPT_NAME=$(basename "$0")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVES=()
INSTALL_DIR=""
DO_BACKUP=true
DO_ROLLBACK=false
RESTART_SERVICES=true

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
error() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
info()  { echo -e "${GREEN}INFO: $1${NC}"; }
warn()  { echo -e "${YELLOW}WARNING: $1${NC}"; }

usage() { sed -n '4,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

# ----------------------------------------------------------------------------- args
while [[ $# -gt 0 ]]; do
    case $1 in
        --install-dir) INSTALL_DIR="$2"; shift 2 ;;
        --no-backup)   DO_BACKUP=false; shift ;;
        --no-restart)  RESTART_SERVICES=false; shift ;;
        --rollback)    DO_ROLLBACK=true; shift ;;
        --help|-h)     usage ;;
        -*)            error "Неизвестная опция: $1" ;;
        *)
            if [[ "$1" == *.json ]]; then :   # старый формат вызова: config.json — игнорируем
            else ARCHIVES+=("$1"); fi
            shift ;;
    esac
done

# ----------------------------------------------------------------------------- checks
command -v docker >/dev/null 2>&1 || error "Docker не установлен."
docker info >/dev/null 2>&1 || error "Docker не запущен или нет прав. Попробуйте: sudo usermod -aG docker \$USER и перезайдите."
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose"
else error "docker compose не найден."; fi

json_get() {  # json_get FILE key.path
    python3 -c "
import json,sys
d=json.load(open('$1'))
for k in '$2'.split('.'):
    d=d.get(k) if isinstance(d,dict) else None
print('' if d is None else d)" 2>/dev/null
}

detect_install_dir() {
    [ -n "$INSTALL_DIR" ] && return
    local cands=()
    for cfg in "$SCRIPT_DIR/overleaf_config.json" "$HOME/latexspace/overleaf_config.json" /opt/overleaf/overleaf_config.json; do
        [ -f "$cfg" ] && cands+=("$(json_get "$cfg" installDir)")
    done
    cands+=("$SCRIPT_DIR" "$HOME/latexspace" "$HOME/overleaf" /opt/overleaf)
    for d in "${cands[@]}"; do
        [ -n "$d" ] && [ -f "$d/docker-compose.yml" ] && grep -q "overleaf-custom" "$d/docker-compose.yml" 2>/dev/null && { INSTALL_DIR="$d"; return; }
    done
    error "Не нашёл установку LaTeXSpace. Укажите: $SCRIPT_NAME ... --install-dir /путь/к/latexspace"
}
detect_install_dir
[ -f "$INSTALL_DIR/docker-compose.yml" ] || error "В $INSTALL_DIR нет docker-compose.yml"

PORT=$(grep -E '^OVERLEAF_PORT=' "$INSTALL_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '"'"'")
PORT="${PORT:-80}"

image_revision() { docker inspect --format '{{index .Config.Labels "com.overleaf.ce.revision"}}' "$1" 2>/dev/null || true; }

wait_for_service() {
    info "Жду, пока сервис ответит на http://localhost:$PORT/status ..."
    local i
    for i in $(seq 1 90); do
        if curl -fsS -m 3 "http://localhost:$PORT/status" >/dev/null 2>&1; then
            info "Сервис отвечает."
            return 0
        fi
        sleep 2
    done
    return 1
}

start_and_check() {
    cd "$INSTALL_DIR"
    info "Запускаю сервисы..."
    $COMPOSE up -d
    if wait_for_service; then
        echo
        echo "=========================================="
        echo -e "${GREEN}Готово. Работает версия: $(image_revision overleaf-custom:latest | cut -c1-10)${NC}"
        echo "=========================================="
        echo "Проверьте сайт в браузере. Если что-то не так — откат одной командой:"
        echo "  $SCRIPT_DIR/$SCRIPT_NAME --rollback"
        echo "Логи:  cd $INSTALL_DIR && $COMPOSE logs -f sharelatex"
    else
        echo
        echo -e "${RED}Сервис не ответил за 3 минуты.${NC} Логи:  cd $INSTALL_DIR && $COMPOSE logs --tail=100 sharelatex"
        if [ "$DO_ROLLBACK" = true ]; then
            echo "Вернуться на версию, которая была до отката:"
            echo "  docker tag overleaf-custom:rolled-back overleaf-custom:latest && cd $INSTALL_DIR && $COMPOSE up -d"
        else
            echo "Откат на предыдущую версию:  $SCRIPT_DIR/$SCRIPT_NAME --rollback"
        fi
        exit 1
    fi
}

# ----------------------------------------------------------------------------- rollback
if [ "$DO_ROLLBACK" = true ]; then
    docker image inspect overleaf-custom:previous >/dev/null 2>&1 || error "Нет сохранённой предыдущей версии (overleaf-custom:previous)."
    echo "Откат: $(image_revision overleaf-custom:latest | cut -c1-10) -> $(image_revision overleaf-custom:previous | cut -c1-10)"
    cd "$INSTALL_DIR"
    $COMPOSE stop sharelatex || true
    docker tag overleaf-custom:latest overleaf-custom:rolled-back 2>/dev/null || true
    docker tag overleaf-custom:previous overleaf-custom:latest
    [ -f "$INSTALL_DIR/VERSION.previous" ] && cp "$INSTALL_DIR/VERSION.previous" "$INSTALL_DIR/VERSION"
    start_and_check
    exit 0
fi

# ----------------------------------------------------------------------------- update
[ "${#ARCHIVES[@]}" -gt 0 ] || error "Укажите пакет(ы): $SCRIPT_NAME overleaf-fix.tar.gz  и/или  overleaf-scripts.tar.gz"
for a in "${ARCHIVES[@]}"; do [ -f "$a" ] || error "Файл не найден: $a"; done

echo "=========================================="
echo "Обновление LaTeXSpace"
echo "=========================================="
echo "Пакеты:    ${ARCHIVES[*]}"
echo "Установка: $INSTALL_DIR"
echo "Сейчас:    $(image_revision overleaf-custom:latest | cut -c1-10)"
echo "=========================================="

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Два вида пакетов: overleaf-scripts.tar.gz (служебные скрипты, маленький) и
# overleaf-fix.tar.gz (образ приложения, большой). Можно передать любой или оба.
IMAGE_DIR=""
for a in "${ARCHIVES[@]}"; do
    d="$TEMP_DIR/$(basename "$a" .tar.gz)"; mkdir -p "$d"
    info "Распаковываю $(basename "$a")..."
    tar -xzf "$a" -C "$d" --strip-components=1 --warning=no-unknown-keyword 2>/dev/null \
      || tar -xzf "$a" -C "$d" --strip-components=1
    if [ -f "$d/overleaf-backup.sh" ]; then
        mkdir -p "$INSTALL_DIR/scripts"
        cp "$d"/*.sh "$d"/*.md "$INSTALL_DIR/scripts/" 2>/dev/null || true
        chmod +x "$INSTALL_DIR"/scripts/*.sh 2>/dev/null || true
        info "Служебные скрипты обновлены в $INSTALL_DIR/scripts/ ($(grep '^REVISION=' "$d/VERSION" 2>/dev/null | cut -c10-19))"
        # сам установщик тоже мог обновиться — подменяем копию рядом с пакетами
        [ -f "$d/install_fix.sh" ] && [ "$d/install_fix.sh" != "$SCRIPT_DIR/$SCRIPT_NAME" ] && cp "$d/install_fix.sh" "$SCRIPT_DIR/$SCRIPT_NAME" 2>/dev/null || true
    elif [ -f "$d/overleaf-custom.tar" ]; then
        IMAGE_DIR="$d"
    else
        error "$(basename "$a"): не похоже ни на пакет образа, ни на пакет скриптов."
    fi
done
mkdir -p "$INSTALL_DIR/scripts"
cp "$SCRIPT_DIR/$SCRIPT_NAME" "$INSTALL_DIR/scripts/$SCRIPT_NAME" 2>/dev/null || true

if [ -z "$IMAGE_DIR" ]; then
    echo
    echo -e "${GREEN}Готово: обновлены только служебные скрипты, сервис не трогали.${NC}"
    exit 0
fi

[ -f "$IMAGE_DIR/VERSION" ] && NEW_REV=$(grep '^REVISION=' "$IMAGE_DIR/VERSION" | cut -d= -f2) || NEW_REV=""
[ -n "$NEW_REV" ] && echo "Новая версия приложения: ${NEW_REV:0:10}"
if [ -n "$NEW_REV" ] && [ "$NEW_REV" = "$(image_revision overleaf-custom:latest)" ]; then
    warn "Эта версия уже установлена. Продолжаю (образ будет перезагружен)."
fi

# Резервная копия
BACKUP_SH="$INSTALL_DIR/scripts/overleaf-backup.sh"
if [ "$DO_BACKUP" = true ]; then
    if [ -x "$BACKUP_SH" ]; then
        info "Делаю резервную копию перед обновлением (сервис будет остановлен)..."
        if ! "$BACKUP_SH" backup --stop --no-start; then
            echo
            error "Резервная копия не удалась — обновление ОТМЕНЕНО, ничего не изменено. Запустите сервис: cd $INSTALL_DIR && $COMPOSE up -d   (подробности: $INSTALL_DIR/backups/backup.log)"
        fi
    else
        warn "Скрипт резервного копирования не найден ($BACKUP_SH) — обновляю БЕЗ бэкапа."
    fi
fi

# Останавливаем приложение (если бэкап не делали — оно ещё работает)
cd "$INSTALL_DIR"
info "Останавливаю приложение..."
$COMPOSE stop sharelatex 2>/dev/null || true

# Запоминаем текущий образ для отката
if docker image inspect overleaf-custom:latest >/dev/null 2>&1; then
    docker tag overleaf-custom:latest overleaf-custom:previous
    [ -f "$INSTALL_DIR/VERSION" ] && cp "$INSTALL_DIR/VERSION" "$INSTALL_DIR/VERSION.previous"
    info "Предыдущая версия сохранена как overleaf-custom:previous"
fi

# Загружаем новый образ
info "Загружаю новый образ (1–3 минуты)..."
LOAD_OUT=$(docker load -i "$IMAGE_DIR/overleaf-custom.tar")
echo "$LOAD_OUT"
LOADED=$(echo "$LOAD_OUT" | sed -n 's/^Loaded image: //p' | grep "overleaf-custom:" | grep -v base | head -1)
[ -n "$LOADED" ] || error "Не удалось определить загруженный образ."
docker tag "$LOADED" overleaf-custom:latest
info "Образ $LOADED помечен как overleaf-custom:latest"

[ -f "$IMAGE_DIR/VERSION" ] && cp "$IMAGE_DIR/VERSION" "$INSTALL_DIR/VERSION"

if [ "$RESTART_SERVICES" = true ]; then
    start_and_check
else
    info "Образ установлен, сервис не запущен (--no-restart). Запуск: cd $INSTALL_DIR && $COMPOSE up -d"
fi

# Прибираем старые образы (оставляем latest и previous)
KEEP_IDS=$(docker image inspect --format '{{.Id}}' overleaf-custom:latest overleaf-custom:previous 2>/dev/null | sort -u)
for img in $(docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep '^overleaf-custom:' | grep -v ':latest \|:previous ' | awk '{print $1}'); do
    id=$(docker image inspect --format '{{.Id}}' "$img" 2>/dev/null)
    if ! echo "$KEEP_IDS" | grep -q "$id"; then docker rmi "$img" >/dev/null 2>&1 && info "Удалён старый образ $img" || true; fi
done
