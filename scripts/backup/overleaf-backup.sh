#!/bin/bash
# =============================================================================
#  overleaf-backup.sh — резервное копирование и восстановление LaTeXSpace/Overleaf
# =============================================================================
#
#  Один файл, никаких переменных окружения. Все настройки — в блоке ниже.
#
#  Команды:
#    overleaf-backup.sh install            установить ежедневный бэкап (cron) и сделать первый
#    overleaf-backup.sh backup             бэкап «на горячую», сервис не останавливается
#    overleaf-backup.sh backup --stop      бэкап с остановкой (перед обновлением!) — максимально надёжный
#    overleaf-backup.sh list               показать существующие копии
#    overleaf-backup.sh status             когда был последний бэкап и успешен ли он
#    overleaf-backup.sh verify             проверить архив и пробно развернуть базу из последней копии
#    overleaf-backup.sh restore ИМЯ        восстановить копию ИМЯ (из `list`); сервис будет остановлен
#    overleaf-backup.sh cleanup            удалить старые данные (*.before-restore-*), оставшиеся после restore
#    overleaf-backup.sh cloud-setup        настроить копию в облако (Яндекс.Диск/Google Диск/S3)
#    overleaf-backup.sh cloud-status       что сейчас лежит в облаке
#    overleaf-backup.sh cloud-pull         скачать копии из облака обратно на сервер
#    overleaf-backup.sh help
#
#  Что бэкапится:
#    * MongoDB       — пользователи, проекты, тексты документов, комментарии (mongodump)
#    * sharelatex_data — загруженные файлы и история версий (кэш компиляции исключён)
#    * Redis         — сессии пользователей (dump.rdb)
#    * docker-compose.yml, .env, VERSION — конфигурация установки
#
#  Хранение: borg (если установлен) — дедупликация, экономия места, проверка целостности.
#            Если borg нет — обычные .tar.gz по одному на бэкап.
#            Плюс, если настроено (cloud-setup), копия уходит в облако через rclone.
# =============================================================================

# ----------------------------- НАСТРОЙКИ -------------------------------------

# Каталог, где лежит docker-compose.yml установленного Overleaf.
# Пусто = определить автоматически (каталог, в котором находится этот скрипт,
# или каталог выше него, или /opt/overleaf).
INSTALL_DIR=""

# Куда складывать резервные копии. ОБЯЗАТЕЛЬНО другой диск/раздел, если он есть.
# Пусто = <INSTALL_DIR>/backups
BACKUP_DIR=""

# Второе место хранения НА ЭТОМ ЖЕ СЕРВЕРЕ (необязательно): другой примонтированный
# диск или каталог. Каждый бэкап дополнительно кладётся и туда.
#   пример: "/mnt/backup-disk/overleaf-backups"
BACKUP_DIR_2=""

# Копия в облако (Яндекс.Диск, Google Диск, S3 хостинга и т.п.).
# Не заполняйте вручную — выполните:  ./overleaf-backup.sh cloud-setup
# Скрипт сам всё спросит и впишет сюда нужную строку.
CLOUD_REMOTE=""

# Сколько копий хранить (для borg). Всё, что старше — удаляется автоматически.
KEEP_DAILY=14
KEEP_WEEKLY=8
KEEP_MONTHLY=12

# Сколько дней хранить .tar.gz, если borg не установлен.
KEEP_DAYS_TAR=14

# Во сколько делать ежедневный бэкап (часы:минуты, по времени сервера).
CRON_TIME="03:30"

# Раз в неделю (по воскресеньям, в это время) — глубокая проверка копии.
CRON_VERIFY_TIME="05:00"

# Имена контейнеров из docker-compose.yml. Обычно менять не нужно.
C_APP="sharelatex"
C_MONGO="mongo"
C_REDIS="redis"

# --------------------------- КОНЕЦ НАСТРОЕК ----------------------------------

set -u
set -o pipefail
export BORG_RELOCATED_REPO_ACCESS_IS_OK=yes BORG_UNKNOWN_UNENCRYPTED_REPO_ACCESS_IS_OK=yes
export LC_ALL=C.UTF-8 2>/dev/null || export LC_ALL=C

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "$(date '+%F %T') $*" | tee -a "${LOG_FILE:-/dev/null}"; }
info() { log "${GREEN}INFO${NC}  $*"; }
warn() { log "${YELLOW}WARN${NC}  $*"; }
die()  { log "${RED}ERROR${NC} $*"; write_status "FAIL" "$*"; exit 1; }

# ----------------------------- инициализация ---------------------------------

detect_install_dir() {
    if [ -n "$INSTALL_DIR" ]; then return; fi
    for d in "$SCRIPT_DIR" "$SCRIPT_DIR/.." "$SCRIPT_DIR/../.." /opt/overleaf "$HOME/overleaf" "$HOME/latexspace"; do
        if [ -f "$d/docker-compose.yml" ] && grep -q "$C_APP" "$d/docker-compose.yml" 2>/dev/null; then
            INSTALL_DIR="$(cd "$d" && pwd)"; return
        fi
    done
    echo "Не нашёл docker-compose.yml Overleaf. Укажите INSTALL_DIR в начале скрипта." >&2
    exit 1
}

init() {
    detect_install_dir
    # Каталог данных: из .env (OVERLEAF_DATA_DIR) либо <INSTALL_DIR>/data
    DATA_DIR=""
    if [ -f "$INSTALL_DIR/.env" ]; then
        DATA_DIR="$(grep -E '^OVERLEAF_DATA_DIR=' "$INSTALL_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'")"
    fi
    [ -z "$DATA_DIR" ] && DATA_DIR="./data"
    case "$DATA_DIR" in /*) ;; *) DATA_DIR="$INSTALL_DIR/$DATA_DIR" ;; esac
    local want="$DATA_DIR"
    DATA_DIR="$(cd "$DATA_DIR" 2>/dev/null && pwd)" || { echo "Каталог данных не найден: $want (путь берётся из $INSTALL_DIR/.env)" >&2; exit 1; }

    [ -z "$BACKUP_DIR" ] && BACKUP_DIR="$INSTALL_DIR/backups"
    mkdir -p "$BACKUP_DIR" || { echo "Не могу создать $BACKUP_DIR" >&2; exit 1; }
    LOG_FILE="$BACKUP_DIR/backup.log"
    STATUS_FILE="$BACKUP_DIR/LAST_STATUS.txt"
    LOCK_FILE="$BACKUP_DIR/.lock"
    STAGING="$BACKUP_DIR/.staging"
    BORG_REPO="$BACKUP_DIR/borg"
    TAR_DIR="$BACKUP_DIR/archives"

    # Лог не должен расти бесконечно
    if [ -f "$LOG_FILE" ] && [ "$(stat -c %s "$LOG_FILE" 2>/dev/null || echo 0)" -gt 5000000 ]; then
        tail -c 1000000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi

    if command -v borg >/dev/null 2>&1; then USE_BORG=1; else USE_BORG=0; fi
    CLOUD_MARK="$BACKUP_DIR/LAST_CLOUD_SYNC.txt"

    if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose"
    else echo "docker compose не найден" >&2; exit 1; fi

    # Файлы в каталоге данных принадлежат root/пользователям контейнеров, поэтому
    # читаем и пишем их через вспомогательный контейнер (sudo не нужен).
    HELPER_IMAGE=""
    for img in alpine busybox redis:6.2 mongo:6.0; do
        docker image inspect "$img" >/dev/null 2>&1 && { HELPER_IMAGE="$img"; break; }
    done
    [ -n "$HELPER_IMAGE" ] || { echo "Не найден ни один образ для вспомогательного контейнера (alpine/busybox/redis/mongo)" >&2; exit 1; }
}

# Выполнить команду от root с каталогом данных, смонтированным в /data
as_root() {
    docker run --rm -i -v "$DATA_DIR":/data --entrypoint sh "$HELPER_IMAGE" -c "$1"
}

epoch_of() {  # "YYYY-MM-DD HH:MM:SS" -> секунды; работает и с GNU, и с BSD date
    date -d "$1" +%s 2>/dev/null || date -j -f '%Y-%m-%d %H:%M:%S' "$1" +%s 2>/dev/null || echo 0
}

write_status() {
    [ -n "${STATUS_FILE:-}" ] || return 0
    printf 'RESULT=%s\nDATE=%s\nMESSAGE=%s\n' "$1" "$(date '+%F %T')" "${2:-}" > "$STATUS_FILE"
}

take_lock() {
    command -v flock >/dev/null 2>&1 || return 0
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then die "Другой экземпляр скрипта уже работает (lock: $LOCK_FILE)"; fi
}

container_running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; }

check_disk_space() {
    # Грубая оценка: место под бэкап должно быть не меньше размера данных без кэша
    local need avail
    need=$(as_root 'du -sm /data/sharelatex_data/data/user_files /data/sharelatex_data/data/history /data/sharelatex_data/data/template_files /data/mongo_data 2>/dev/null' | awk '{s+=$1} END{print s+0}')
    avail=$(df -Pm "$BACKUP_DIR" | awk 'NR==2{print $4}')
    if [ "$avail" -lt "$need" ]; then
        die "Мало места для бэкапа в $BACKUP_DIR: свободно ${avail}MB, данных примерно ${need}MB"
    fi
    info "Место: данных ~${need}MB, свободно ${avail}MB"
}

# ------------------------------- шаги бэкапа ---------------------------------

flush_pending_edits() {
    # Правки последних минут живут в Redis; сбрасываем их в Mongo и в историю.
    if ! container_running "$C_APP"; then warn "Контейнер $C_APP не запущен — пропускаю сброс буферов"; return; fi
    info "Сбрасываю несохранённые правки из Redis в базу..."
    if docker exec "$C_APP" bash -c 'cd /overleaf/services/document-updater && node scripts/flush_all.js' >>"$LOG_FILE" 2>&1; then
        info "document-updater: ок"
    else
        warn "document-updater flush завершился с ошибкой (правки последних ~5 минут могут не попасть в копию)"
    fi
    if docker exec "$C_APP" bash -c 'cd /overleaf/services/project-history && node scripts/flush_all.js' >>"$LOG_FILE" 2>&1; then
        info "project-history: ок"
    else
        warn "project-history flush завершился с ошибкой (история версий может отставать на несколько минут)"
    fi
}

dump_mongo() {
    container_running "$C_MONGO" || die "Контейнер $C_MONGO не запущен — без него бэкап базы невозможен"
    info "Выгружаю MongoDB..."
    local out="$STAGING/mongo/sharelatex.archive.gz"
    mkdir -p "$STAGING/mongo"
    # --oplog даёт снимок базы на один момент времени, даже если в неё пишут
    if ! docker exec "$C_MONGO" mongodump --archive --gzip --oplog --quiet > "$out" 2>>"$LOG_FILE"; then
        warn "mongodump с --oplog не удался, пробую без него"
        docker exec "$C_MONGO" mongodump --archive --gzip --quiet > "$out" 2>>"$LOG_FILE" || die "mongodump не удался"
    fi
    [ -s "$out" ] || die "Дамп MongoDB пустой"
    # Быстрая проверка, что дамп читается
    docker exec -i "$C_MONGO" mongorestore --archive --gzip --dryRun --quiet < "$out" >>"$LOG_FILE" 2>&1 \
        || die "Дамп MongoDB не проходит проверку чтения"
    info "MongoDB: $(du -h "$out" | cut -f1)"
}

dump_redis() {
    mkdir -p "$STAGING/redis"
    if ! container_running "$C_REDIS"; then
        warn "Контейнер $C_REDIS не запущен — копирую dump.rdb как есть"
        as_root 'cat /data/redis_data/dump.rdb' > "$STAGING/redis/dump.rdb" 2>/dev/null || rm -f "$STAGING/redis/dump.rdb"
        return
    fi
    info "Сохраняю Redis..."
    local before after i
    before=$(docker exec "$C_REDIS" redis-cli LASTSAVE 2>/dev/null || echo 0)
    docker exec "$C_REDIS" redis-cli BGSAVE >/dev/null 2>&1 || true
    for i in $(seq 1 60); do
        after=$(docker exec "$C_REDIS" redis-cli LASTSAVE 2>/dev/null || echo 0)
        [ "$after" != "$before" ] && break
        sleep 1
    done
    if ! docker exec "$C_REDIS" cat /data/dump.rdb > "$STAGING/redis/dump.rdb" 2>/dev/null; then
        rm -f "$STAGING/redis/dump.rdb"
        warn "dump.rdb не найден (сессии не сохранятся, это не критично)"
    fi
}

tar_data() {
    # Каталоги данных -> $STAGING/data.tar. Читаем через контейнер от root:
    # файлы принадлежат root/mongodb/redis и владельцы сохраняются в архиве.
    local dirs="$*"
    info "Копирую файлы данных ($dirs)..."
    as_root "cd /data && tar -cf - \
        --exclude=sharelatex_data/data/compiles --exclude=sharelatex_data/data/output \
        --exclude=sharelatex_data/data/cache --exclude=sharelatex_data/data/clsi-cache \
        --exclude=sharelatex_data/tmp \
        --exclude=mongo_data/diagnostic.data \
        $dirs" > "$STAGING/data.tar" 2>>"$LOG_FILE" || die "Не удалось скопировать каталоги данных (см. $LOG_FILE)"
    [ -s "$STAGING/data.tar" ] || die "Архив данных пустой"
    info "Файлы данных: $(du -h "$STAGING/data.tar" | cut -f1)"
}

copy_config() {
    mkdir -p "$STAGING/config"
    for f in docker-compose.yml .env VERSION overleaf_config.json; do
        [ -f "$INSTALL_DIR/$f" ] && cp "$INSTALL_DIR/$f" "$STAGING/config/"
    done
    docker exec "$C_APP" cat /overleaf/services/web/public/version.json > "$STAGING/config/version.json" 2>/dev/null || true
    cat > "$STAGING/config/BACKUP_INFO.txt" <<EOF
created=$(date '+%F %T')
mode=$MODE
install_dir=$INSTALL_DIR
data_dir=$DATA_DIR
host=$(hostname)
EOF
}

borg_init_if_needed() {
    local repo="$1"
    if borg info "$repo" >/dev/null 2>&1; then return 0; fi
    info "Создаю хранилище borg: $repo"
    # Без шифрования: бэкап лежит на вашем же сервере, а потерянный пароль = потерянный бэкап.
    borg init --encryption=none "$repo" >>"$LOG_FILE" 2>&1 || return 1
}

borg_store() {
    local repo="$1" name="$2"
    borg_init_if_needed "$repo" || { warn "Не удалось создать хранилище $repo"; return 1; }
    info "Пишу в borg ($repo)..."
    # В $STAGING лежат: mongo/ (дамп), redis/, config/, data.tar (файлы; кэш компиляции уже исключён)
    (cd "$STAGING" && borg create --stats --compression zstd,3 "$repo::$name" .) >>"$LOG_FILE" 2>&1 || return 1
    borg prune --keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" --keep-monthly "$KEEP_MONTHLY" \
        --keep-within 2d "$repo" >>"$LOG_FILE" 2>&1 || warn "borg prune не удался (некритично)"
    borg compact "$repo" >>"$LOG_FILE" 2>&1 || true
    # Быстрая проверка структуры репозитория после каждой записи
    borg check --repository-only "$repo" >>"$LOG_FILE" 2>&1 || { warn "borg check сообщил о проблеме в $repo — смотрите $LOG_FILE"; return 1; }
    return 0
}

tar_store() {
    local name="$1" out="$TAR_DIR/$name.tar.gz"
    mkdir -p "$TAR_DIR"
    info "Пишу архив $out ..."
    tar -czf "$out" -C "$STAGING" . 2>>"$LOG_FILE" || return 1
    tar -tzf "$out" >/dev/null 2>&1 || return 1
    find "$TAR_DIR" -name '*.tar.gz' -mtime +"$KEEP_DAYS_TAR" -delete
    if [ -n "$BACKUP_DIR_2" ] && [ -d "$BACKUP_DIR_2" ]; then
        cp "$out" "$BACKUP_DIR_2/" && find "$BACKUP_DIR_2" -name '*.tar.gz' -mtime +"$KEEP_DAYS_TAR" -delete
    fi
}

# --------------------------- копия в облако ----------------------------------

cloud_upload() {
    [ -n "$CLOUD_REMOTE" ] || return 0
    if ! command -v rclone >/dev/null 2>&1; then
        warn "Указано облако ($CLOUD_REMOTE), но rclone не установлен. Выполните: $SCRIPT_PATH cloud-setup"
        return 1
    fi
    info "Отправляю копию в облако ($CLOUD_REMOTE)..."
    local rc=0
    if [ "$USE_BORG" = 1 ]; then
        # sync = точная копия хранилища. Запускается только после успешной проверки
        # целостности локального хранилища, поэтому испорченное состояние в облако не уедет.
        # --backup-dir: то, что borg удалил при ротации, ещё 30 дней лежит в облаке отдельно.
        rclone sync "$BORG_REPO" "$CLOUD_REMOTE/borg" \
            --backup-dir "$CLOUD_REMOTE/trash" \
            --transfers 4 --retries 3 --log-level NOTICE >>"$LOG_FILE" 2>&1 || rc=1
        rclone delete "$CLOUD_REMOTE/trash" --min-age 30d >>"$LOG_FILE" 2>&1 || true
        rclone rmdirs "$CLOUD_REMOTE/trash" --leave-root >>"$LOG_FILE" 2>&1 || true
    else
        rclone copy "$TAR_DIR" "$CLOUD_REMOTE/archives" --transfers 2 --retries 3 >>"$LOG_FILE" 2>&1 || rc=1
        rclone delete "$CLOUD_REMOTE/archives" --min-age "${KEEP_DAYS_TAR}d" >>"$LOG_FILE" 2>&1 || true
    fi
    if [ "$rc" = 0 ]; then
        local size; size=$(rclone size "$CLOUD_REMOTE" 2>/dev/null | tail -1)
        printf 'DATE=%s\nREMOTE=%s\nSIZE=%s\n' "$(date '+%F %T')" "$CLOUD_REMOTE" "$size" > "$CLOUD_MARK"
        info "Облако: ок ($size)"
    else
        warn "Отправка в облако НЕ удалась — подробности в $LOG_FILE. Локальная копия при этом сделана."
    fi
    return $rc
}

cmd_cloud_setup() {
    echo "=== Настройка копии в облако ==="
    echo
    if ! command -v rclone >/dev/null 2>&1; then
        echo "Нужна программа rclone (умеет Яндекс.Диск, Google Диск, S3 и др.)."
        echo "Установить:  sudo apt install rclone     (или: curl https://rclone.org/install.sh | sudo bash)"
        echo "После установки запустите эту команду снова."
        exit 1
    fi
    echo "Сейчас откроется настройка rclone. Что там делать:"
    echo "  1) n           — новое подключение (New remote)"
    echo "  2) имя:  cloud — введите именно это слово"
    echo "  3) тип хранилища:"
    echo "       Яндекс.Диск  — найдите в списке 'yandex' (Yandex Disk)"
    echo "       Google Диск  — 'drive' (Google Drive)"
    echo "       S3 хостинга  — 's3', далее провайдер и ключи из панели хостинга"
    echo "  4) client_id / client_secret — просто Enter (оставить пустыми)"
    echo "  5) 'Use auto config?' — ответьте n (сервер без браузера), rclone выдаст"
    echo "     команду и ссылку: откройте ссылку в браузере на своём компьютере,"
    echo "     разрешите доступ и вставьте полученный код обратно в терминал"
    echo "  6) y — подтвердить, затем q — выйти"
    echo
    echo "ВАЖНО: запускайте эту команду от того же пользователя, от которого будете"
    echo "запускать 'install' (то есть без sudo, если install тоже без sudo) —"
    echo "иначе ночной бэкап не найдёт настройки подключения."
    read -r -p "Нажмите Enter, чтобы продолжить..." _
    rclone config
    echo
    local remote name
    read -r -p "Имя подключения, которое вы создали [cloud]: " name; name="${name:-cloud}"
    read -r -p "Папка в облаке для копий [overleaf-backups]: " remote; remote="${remote:-overleaf-backups}"
    local full="$name:$remote"
    echo "Проверяю доступ к $full ..."
    rclone mkdir "$full" >/dev/null 2>&1
    rclone lsd "$name:" >/dev/null 2>&1 || die "Подключение '$name' не работает. Запустите cloud-setup ещё раз."
    # Записываем настройку в сам скрипт (через новый файл, чтобы не портить работающий)
    local tmp="$SCRIPT_PATH.tmp.$$"
    sed "s|^CLOUD_REMOTE=.*|CLOUD_REMOTE=\"$full\"|" "$SCRIPT_PATH" > "$tmp" || die "Не удалось изменить скрипт"
    grep -q "^CLOUD_REMOTE=\"$full\"$" "$tmp" || { rm -f "$tmp"; die "Не удалось записать настройку в скрипт"; }
    chmod +x "$tmp"; mv "$tmp" "$SCRIPT_PATH" || die "Не удалось сохранить скрипт"
    CLOUD_REMOTE="$full"
    info "Готово: копии будут уходить в $full"
    echo "Отправляю то, что уже накоплено (может занять время)..."
    take_lock
    cloud_upload && echo "Проверить в любой момент: $SCRIPT_PATH cloud-status"
}

cmd_cloud_status() {
    [ -n "$CLOUD_REMOTE" ] || { echo "Копия в облако не настроена. Выполните: $SCRIPT_PATH cloud-setup"; return 1; }
    echo "Облако: $CLOUD_REMOTE"
    if [ -f "$CLOUD_MARK" ]; then cat "$CLOUD_MARK"; else echo "Успешных отправок ещё не было."; fi
    command -v rclone >/dev/null 2>&1 || { echo "rclone не установлен!"; return 1; }
    echo "Сейчас в облаке:"; rclone size "$CLOUD_REMOTE" 2>&1 | tail -2
}

cmd_cloud_pull() {
    # Забрать копии из облака обратно на сервер (если локальные потеряны)
    [ -n "$CLOUD_REMOTE" ] || die "Облако не настроено (CLOUD_REMOTE пуст)"
    command -v rclone >/dev/null 2>&1 || die "rclone не установлен"
    info "Скачиваю копии из облака в $BACKUP_DIR ..."
    if [ "$USE_BORG" = 1 ]; then
        rclone copy "$CLOUD_REMOTE/borg" "$BORG_REPO" --transfers 4 --progress || die "Скачивание не удалось"
    else
        rclone copy "$CLOUD_REMOTE/archives" "$TAR_DIR" --transfers 2 --progress || die "Скачивание не удалось"
    fi
    info "Готово. Список копий: $SCRIPT_PATH list"
}

# ------------------------------- команды -------------------------------------

cmd_backup() {
    MODE="hot"
    local start_after=1
    for a in "$@"; do
        case "$a" in
            --stop) MODE="stop" ;;
            --no-start) start_after=0 ;;
            *) die "Неизвестная опция: $a" ;;
        esac
    done
    take_lock
    check_disk_space
    rm -rf "$STAGING"; mkdir -p "$STAGING"
    local name="overleaf-$STAMP-$MODE"
    local data_dirs="sharelatex_data"

    if [ "$MODE" = "stop" ]; then
        info "Режим с остановкой: останавливаю приложение (буферы сбросятся автоматически)..."
        (cd "$INSTALL_DIR" && $COMPOSE stop "$C_APP") >>"$LOG_FILE" 2>&1 || die "Не удалось остановить $C_APP"
    else
        flush_pending_edits
    fi

    dump_mongo
    dump_redis
    copy_config

    if [ "$MODE" = "stop" ]; then
        # Дополнительно — «сырые» каталоги базы, консистентные, т.к. всё остановлено
        info "Останавливаю mongo и redis для копии сырых файлов..."
        (cd "$INSTALL_DIR" && $COMPOSE stop "$C_MONGO" "$C_REDIS") >>"$LOG_FILE" 2>&1 || warn "Не удалось остановить mongo/redis, сырые каталоги не копирую"
        if ! container_running "$C_MONGO" && ! container_running "$C_REDIS"; then
            data_dirs="sharelatex_data mongo_data redis_data"
        fi
    fi
    tar_data $data_dirs

    local ok=1
    if [ "$USE_BORG" = 1 ]; then
        borg_store "$BORG_REPO" "$name" || ok=0
        if [ -n "$BACKUP_DIR_2" ]; then
            borg_store "$BACKUP_DIR_2/borg" "$name" || warn "Копия во второе хранилище ($BACKUP_DIR_2) не удалась"
        fi
    else
        warn "borg не установлен — использую tar.gz (установите: apt install borgbackup — станет компактнее и надёжнее)"
        tar_store "$name" || ok=0
    fi

    if [ "$MODE" = "stop" ] && [ "$start_after" = 1 ]; then
        info "Запускаю сервисы..."
        (cd "$INSTALL_DIR" && $COMPOSE up -d) >>"$LOG_FILE" 2>&1 || warn "Не удалось запустить сервисы! Выполните: cd $INSTALL_DIR && $COMPOSE up -d"
    elif [ "$MODE" = "stop" ]; then
        info "Сервисы оставлены остановленными (--no-start). Запуск: cd $INSTALL_DIR && $COMPOSE up -d"
    fi

    rm -rf "$STAGING"
    if [ "$ok" = 1 ]; then
        cloud_upload || true
        write_status "OK" "$name"
        info "${GREEN}Бэкап готов: $name${NC}"
        [ "$USE_BORG" = 1 ] && info "Хранилище: $BORG_REPO ($(du -sh "$BORG_REPO" | cut -f1))"
    else
        die "Бэкап $name НЕ удался — см. $LOG_FILE"
    fi
}

cmd_list() {
    if [ "$USE_BORG" = 1 ] && borg info "$BORG_REPO" >/dev/null 2>&1; then
        echo "Хранилище: $BORG_REPO"
        borg list --format '{archive:<45} {time}{NL}' "$BORG_REPO"
    fi
    if [ -d "$TAR_DIR" ]; then
        echo "Архивы tar.gz в $TAR_DIR:"; ls -lh "$TAR_DIR"
    fi
    echo; cmd_status
}

cmd_status() {
    if [ ! -f "$STATUS_FILE" ]; then echo "Бэкапов ещё не было."; return 1; fi
    local result date msg age
    result=$(grep '^RESULT=' "$STATUS_FILE" | cut -d= -f2)
    date=$(grep '^DATE=' "$STATUS_FILE" | cut -d= -f2-)
    msg=$(grep '^MESSAGE=' "$STATUS_FILE" | cut -d= -f2-)
    age=$(( ( $(date +%s) - $(epoch_of "$date") ) / 3600 ))
    if [ "$result" = "OK" ]; then echo -e "Последний бэкап: ${GREEN}OK${NC}  $date (${age} ч. назад)  $msg"
    else echo -e "Последний бэкап: ${RED}ОШИБКА${NC}  $date (${age} ч. назад)  $msg"; echo "Подробности: $LOG_FILE"; return 1; fi
    if [ "$age" -gt 48 ]; then echo -e "${YELLOW}Внимание: последний бэкап старше двух суток. Проверьте cron (crontab -l).${NC}"; return 1; fi
    if [ -n "$CLOUD_REMOTE" ]; then
        if [ -f "$CLOUD_MARK" ]; then
            local cdate cage; cdate=$(grep '^DATE=' "$CLOUD_MARK" | cut -d= -f2-)
            cage=$(( ( $(date +%s) - $(epoch_of "$cdate") ) / 3600 ))
            if [ "$cage" -gt 48 ]; then echo -e "Копия в облаке: ${YELLOW}устарела${NC} ($cdate, ${cage} ч. назад)"
            else echo -e "Копия в облаке: ${GREEN}OK${NC}  $cdate ($CLOUD_REMOTE)"; fi
        else echo -e "Копия в облаке: ${RED}ни разу не отправлялась${NC} ($CLOUD_REMOTE)"; fi
    else
        echo -e "${YELLOW}Копия в облаке не настроена — бэкапы есть только на этом сервере.${NC}"
        echo "  Настроить: $SCRIPT_PATH cloud-setup"
    fi
    if crontab -l 2>/dev/null | grep -q "$SCRIPT_PATH"; then echo "Автоматический бэкап: включён ($(crontab -l | grep "$SCRIPT_PATH" | grep -c .) задания в cron)"
    else echo -e "${YELLOW}Автоматический бэкап НЕ настроен. Выполните: $SCRIPT_PATH install${NC}"; fi
}

latest_archive() {
    borg list --short --last 1 "$BORG_REPO" 2>/dev/null
}

extract_archive_to() {
    # $1 = имя архива, $2 = каталог
    local name="$1" dest="$2"
    mkdir -p "$dest"
    if [ "$USE_BORG" = 1 ] && borg list "$BORG_REPO::$name" >/dev/null 2>&1; then
        (cd "$dest" && borg extract "$BORG_REPO::$name") >>"$LOG_FILE" 2>&1 || return 1
    elif [ -f "$TAR_DIR/$name.tar.gz" ]; then
        tar -xzf "$TAR_DIR/$name.tar.gz" -C "$dest" >>"$LOG_FILE" 2>&1 || return 1
    else
        return 1
    fi
    EX_STAGING="$dest"
    [ -f "$EX_STAGING/mongo/sharelatex.archive.gz" ] || return 1
    [ -f "$EX_STAGING/data.tar" ] || return 1
}

cmd_verify() {
    take_lock
    local name="${1:-}"
    [ "$USE_BORG" = 1 ] && [ -z "$name" ] && name="$(latest_archive)"
    [ -z "$name" ] && [ -d "$TAR_DIR" ] && name="$(ls -t "$TAR_DIR" | head -1 | sed 's/\.tar\.gz$//')"
    [ -n "$name" ] || die "Нет ни одной копии для проверки"
    info "Проверяю копию $name ..."

    if [ "$USE_BORG" = 1 ]; then
        info "borg check (целостность хранилища, может занять время)..."
        borg check --verify-data "$BORG_REPO" >>"$LOG_FILE" 2>&1 || die "borg check: хранилище повреждено! См. $LOG_FILE"
        info "borg check: ок"
    fi

    local tmp="$BACKUP_DIR/.verify"; rm -rf "$tmp"
    extract_archive_to "$name" "$tmp" || die "Не удалось распаковать копию $name"
    info "Распаковка: ок. Пробное восстановление базы в отдельный временный MongoDB..."

    local cname="overleaf-verify-mongo-$$"
    docker run --rm -d --name "$cname" mongo:6.0 >/dev/null 2>&1 || die "Не удалось запустить временный mongo"
    local i; for i in $(seq 1 30); do docker exec "$cname" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 && break; sleep 1; done
    local counts
    if docker exec -i "$cname" mongorestore --archive --gzip --quiet < "$EX_STAGING/mongo/sharelatex.archive.gz" >>"$LOG_FILE" 2>&1; then
        counts=$(docker exec "$cname" mongosh sharelatex --quiet --eval \
          'print("пользователей: "+db.users.countDocuments()+", проектов: "+db.projects.countDocuments()+", документов: "+db.docs.countDocuments())' 2>/dev/null)
        docker rm -f "$cname" >/dev/null 2>&1
    else
        docker rm -f "$cname" >/dev/null 2>&1
        rm -rf "$tmp"; die "Пробное восстановление базы НЕ удалось"
    fi
    local nfiles; nfiles=$(tar -tf "$EX_STAGING/data.tar" 2>/dev/null | grep -c '^sharelatex_data/.*[^/]$')
    rm -rf "$tmp"
    info "${GREEN}Копия $name исправна.${NC} База: $counts. Файлов в sharelatex_data: $nfiles"
    echo "VERIFY_OK=$(date '+%F %T') $name" >> "$STATUS_FILE"
}

cmd_restore() {
    local name="${1:-}"; local yes="${2:-}"
    [ -n "$name" ] || die "Укажите имя копии: $SCRIPT_PATH restore ИМЯ   (имена — в '$SCRIPT_PATH list')"
    take_lock
    echo -e "${YELLOW}ВНИМАНИЕ:${NC} сервис будет остановлен, текущие данные заменены данными из копии '$name'."
    echo "Текущие данные не удаляются, а переименовываются в *.before-restore-$STAMP"
    if [ "$yes" != "--yes" ]; then
        read -r -p "Продолжить? Введите 'yes': " ans; [ "$ans" = "yes" ] || { echo "Отменено."; exit 0; }
    fi

    local tmp="$BACKUP_DIR/.restore"; rm -rf "$tmp"
    info "Распаковываю копию..."
    extract_archive_to "$name" "$tmp" || die "Не удалось распаковать копию $name"

    info "Останавливаю сервисы..."
    (cd "$INSTALL_DIR" && $COMPOSE down) >>"$LOG_FILE" 2>&1 || die "Не удалось остановить сервисы"

    # Какие каталоги есть в копии (в режиме --stop там ещё mongo_data и redis_data)
    local in_tar; in_tar=$(tar -tf "$EX_STAGING/data.tar" | cut -d/ -f1 | sort -u | tr '\n' ' ')
    local has_raw_mongo=0; echo "$in_tar" | grep -q "mongo_data" && has_raw_mongo=1

    # 1. Текущие данные — в сторону (переименование не требует прав на сами файлы)
    local d
    for d in sharelatex_data redis_data mongo_data; do
        [ -d "$DATA_DIR/$d" ] && mv "$DATA_DIR/$d" "$DATA_DIR/$d.before-restore-$STAMP"
    done

    # 2. Файлы из копии — через контейнер от root, чтобы сохранить владельцев
    info "Восстанавливаю файлы данных ($in_tar)..."
    as_root 'cd /data && tar -xf -' < "$EX_STAGING/data.tar" || die "Не удалось распаковать файлы данных. Старые данные: $DATA_DIR/*.before-restore-$STAMP"
    as_root 'mkdir -p /data/sharelatex_data/data/compiles /data/sharelatex_data/data/output /data/redis_data /data/mongo_data && chown 999:999 /data/redis_data /data/mongo_data'

    # 3. Redis (если в копии не было сырого каталога)
    if [ -f "$EX_STAGING/redis/dump.rdb" ] && ! echo "$in_tar" | grep -q "redis_data"; then
        info "Восстанавливаю Redis..."
        as_root 'cat > /data/redis_data/dump.rdb && chown 999:999 /data/redis_data/dump.rdb' < "$EX_STAGING/redis/dump.rdb"
    fi

    # 4. MongoDB
    if [ "$has_raw_mongo" = 1 ]; then
        info "MongoDB восстановлена из сырой копии каталога"
        (cd "$INSTALL_DIR" && $COMPOSE up -d "$C_MONGO" "$C_REDIS") >>"$LOG_FILE" 2>&1
    else
        info "Восстанавливаю MongoDB из дампа..."
        (cd "$INSTALL_DIR" && $COMPOSE up -d "$C_MONGO" "$C_REDIS") >>"$LOG_FILE" 2>&1 || die "Не удалось запустить mongo"
        local i ready=0; for i in $(seq 1 60); do
            docker exec "$C_MONGO" mongosh --quiet --eval 'rs.status().ok' 2>/dev/null | grep -q 1 && { ready=1; break; }; sleep 2
        done
        [ "$ready" = 1 ] || die "MongoDB не поднялся за 2 минуты. Старые данные: $DATA_DIR/*.before-restore-$STAMP"
        docker exec -i "$C_MONGO" mongorestore --archive --gzip --drop --oplogReplay --quiet < "$EX_STAGING/mongo/sharelatex.archive.gz" >>"$LOG_FILE" 2>&1 \
        || docker exec -i "$C_MONGO" mongorestore --archive --gzip --drop --quiet < "$EX_STAGING/mongo/sharelatex.archive.gz" >>"$LOG_FILE" 2>&1 \
        || die "mongorestore не удался. Старые данные: $DATA_DIR/*.before-restore-$STAMP"
    fi

    info "Запускаю сервисы..."
    (cd "$INSTALL_DIR" && $COMPOSE up -d) >>"$LOG_FILE" 2>&1 || die "Не удалось запустить сервисы"
    rm -rf "$tmp"
    write_status "OK" "restored $name"
    info "${GREEN}Восстановление завершено.${NC} Проверьте сайт. Старые данные лежат в $DATA_DIR/*.before-restore-$STAMP — когда убедитесь, что всё в порядке, удалите их: $SCRIPT_PATH cleanup"
}

cmd_cleanup() {
    # Удалить каталоги *.before-restore-* (они принадлежат root — удаляем через контейнер)
    local list; list=$(ls -d "$DATA_DIR"/*.before-restore-* 2>/dev/null)
    [ -n "$list" ] || { echo "Нечего удалять: каталогов *.before-restore-* нет."; return 0; }
    echo "Будут удалены:"; echo "$list" | sed 's/^/  /'
    if [ "${1:-}" != "--yes" ]; then
        read -r -p "Удалить? Введите 'yes': " ans; [ "$ans" = "yes" ] || { echo "Отменено."; exit 0; }
    fi
    as_root 'rm -rf /data/*.before-restore-*' && info "Удалено."
}

cmd_install() {
    chmod +x "$SCRIPT_PATH"
    if [ "$USE_BORG" = 0 ]; then
        warn "borg не установлен. Очень рекомендую: sudo apt install borgbackup  (потом снова запустите install)"
    fi
    local h m vh vm
    h="${CRON_TIME%%:*}"; m="${CRON_TIME##*:}"; vh="${CRON_VERIFY_TIME%%:*}"; vm="${CRON_VERIFY_TIME##*:}"
    local tag="# overleaf-backup"
    local new
    new=$( (crontab -l 2>/dev/null | grep -v "$tag" | grep -v '^PATH=.*# overleaf-backup'; \
        echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin $tag"; \
        echo "$((10#$m)) $((10#$h)) * * * $SCRIPT_PATH backup >> $LOG_FILE 2>&1 $tag"; \
        echo "$((10#$vm)) $((10#$vh)) * * 0 $SCRIPT_PATH verify >> $LOG_FILE 2>&1 $tag") )
    echo "$new" | crontab - || die "Не удалось записать crontab"
    info "Cron настроен: ежедневный бэкап в $CRON_TIME, проверка по воскресеньям в $CRON_VERIFY_TIME"
    info "Хранилище: $BACKUP_DIR"
    [ -n "$BACKUP_DIR_2" ] && info "Второе хранилище: $BACKUP_DIR_2"
    info "Делаю первый бэкап..."
    cmd_backup
    echo
    echo "Готово. Полезные команды:"
    echo "  $SCRIPT_PATH status          — всё ли в порядке"
    echo "  $SCRIPT_PATH backup --stop   — перед обновлением"
    echo "  $SCRIPT_PATH list            — список копий"
    echo "  $SCRIPT_PATH restore ИМЯ     — восстановить"
}

cmd_help() { sed -n '3,30p' "$SCRIPT_PATH" | sed 's/^# \{0,1\}//'; }

# --------------------------------- main --------------------------------------

CMD="${1:-help}"; shift || true
case "$CMD" in
    help|-h|--help) cmd_help; exit 0 ;;
esac
init
case "$CMD" in
    install) cmd_install "$@" ;;
    backup)  cmd_backup "$@" ;;
    list)    cmd_list ;;
    status)  cmd_status ;;
    verify)  cmd_verify "$@" ;;
    restore) cmd_restore "$@" ;;
    cleanup) cmd_cleanup "$@" ;;
    cloud-setup)  cmd_cloud_setup ;;
    cloud-status) cmd_cloud_status ;;
    cloud-pull)   cmd_cloud_pull ;;
    *) echo "Неизвестная команда: $CMD"; cmd_help; exit 1 ;;
esac
