#!/bin/bash

# Overleaf CE API - Практический пример использования
# Этот скрипт демонстрирует основные операции через API

set -e  # Остановка при ошибке

# ==============================================
# Конфигурация
# ==============================================

BASE_URL="${OVERLEAF_URL:-http://localhost:3000}"
EMAIL="${OVERLEAF_EMAIL:-admin@example.com}"
PASSWORD="${OVERLEAF_PASSWORD:-password}"
COOKIES_FILE="./cookies.txt"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ==============================================
# Вспомогательные функции
# ==============================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Получить CSRF token
get_csrf_token() {
    curl -s -b "$COOKIES_FILE" "$BASE_URL/dev/csrf"
}

# Выполнить POST запрос с JSON
post_json() {
    local endpoint=$1
    local data=$2
    local csrf_token=$(get_csrf_token)
    
    curl -s -b "$COOKIES_FILE" -c "$COOKIES_FILE" \
        -H "Content-Type: application/json" \
        -H "X-CSRF-Token: $csrf_token" \
        -d "$data" \
        "$BASE_URL$endpoint"
}

# Выполнить GET запрос
get_request() {
    local endpoint=$1
    curl -s -b "$COOKIES_FILE" "$BASE_URL$endpoint"
}

# Выполнить DELETE запрос
delete_request() {
    local endpoint=$1
    local csrf_token=$(get_csrf_token)
    
    curl -s -b "$COOKIES_FILE" \
        -X DELETE \
        -H "X-CSRF-Token: $csrf_token" \
        "$BASE_URL$endpoint"
}

# Выполнить PUT запрос с JSON
put_json() {
    local endpoint=$1
    local data=$2
    local csrf_token=$(get_csrf_token)
    
    curl -s -b "$COOKIES_FILE" \
        -X PUT \
        -H "Content-Type: application/json" \
        -H "X-CSRF-Token: $csrf_token" \
        -d "$data" \
        "$BASE_URL$endpoint"
}

# ==============================================
# API Функции
# ==============================================

# Вход в систему
login() {
    log_info "Вход в систему как $EMAIL..."
    
    local response=$(post_json "/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
    
    if echo "$response" | grep -q "redir"; then
        log_info "✓ Успешный вход"
        return 0
    else
        log_error "✗ Ошибка входа"
        echo "$response"
        return 1
    fi
}

# Выход
logout() {
    log_info "Выход из системы..."
    post_json "/logout" "{}"
    rm -f "$COOKIES_FILE"
    log_info "✓ Выход выполнен"
}

# Получить список проектов
get_projects() {
    log_info "Получение списка проектов..."
    local response=$(get_request "/user/projects")
    echo "$response" | jq -r '.projects[] | "\(.name) (\(._id))"'
}

# Создать проект
create_project() {
    local project_name=$1
    log_info "Создание проекта '$project_name'..."
    
    local response=$(post_json "/project/new" "{\"projectName\":\"$project_name\"}")
    local project_id=$(echo "$response" | jq -r '.project_id')
    
    if [ "$project_id" != "null" ]; then
        log_info "✓ Проект создан: $project_id"
        echo "$project_id"
    else
        log_error "✗ Ошибка создания проекта"
        echo "$response"
        return 1
    fi
}

# Переименовать проект
rename_project() {
    local project_id=$1
    local new_name=$2
    log_info "Переименование проекта $project_id в '$new_name'..."
    
    post_json "/project/$project_id/rename" "{\"newProjectName\":\"$new_name\"}"
    log_info "✓ Проект переименован"
}

# Получить участников проекта
get_members() {
    local project_id=$1
    log_info "Получение списка участников проекта $project_id..."
    
    local response=$(get_request "/project/$project_id/members")
    echo "$response" | jq -r '.members[] | "\(.email) - \(.privileges)"'
}

# Пригласить участника
invite_member() {
    local project_id=$1
    local email=$2
    local privileges=${3:-readAndWrite}
    
    log_info "Приглашение $email в проект $project_id с ролью $privileges..."
    
    local response=$(post_json "/project/$project_id/invite" \
        "{\"email\":\"$email\",\"privileges\":\"$privileges\"}")
    
    if echo "$response" | jq -e '.invite' > /dev/null 2>&1; then
        log_info "✓ Участник приглашён"
        echo "$response" | jq '.invite'
    elif echo "$response" | jq -e '.error' > /dev/null 2>&1; then
        local error=$(echo "$response" | jq -r '.error')
        log_error "✗ Ошибка: $error"
        return 1
    else
        log_warn "Неожиданный ответ:"
        echo "$response"
    fi
}

# Изменить роль участника
change_role() {
    local project_id=$1
    local user_id=$2
    local privilege_level=$3
    
    log_info "Изменение роли участника $user_id на $privilege_level..."
    
    put_json "/project/$project_id/users/$user_id" \
        "{\"privilegeLevel\":\"$privilege_level\"}"
    
    log_info "✓ Роль изменена"
}

# Удалить участника
remove_member() {
    local project_id=$1
    local user_id=$2
    
    log_info "Удаление участника $user_id из проекта..."
    
    delete_request "/project/$project_id/users/$user_id"
    log_info "✓ Участник удалён"
}

# Компилировать проект
compile_project() {
    local project_id=$1
    log_info "Запуск компиляции проекта $project_id..."
    
    local response=$(post_json "/project/$project_id/compile" \
        "{\"incrementalCompilesEnabled\":true}")
    
    local status=$(echo "$response" | jq -r '.status')
    local build_id=$(echo "$response" | jq -r '.buildId')
    
    if [ "$status" = "success" ]; then
        log_info "✓ Компиляция успешна (build: $build_id)"
        echo "$build_id"
    else
        log_error "✗ Компиляция не удалась: $status"
        return 1
    fi
}

# Скачать PDF
download_pdf() {
    local project_id=$1
    local build_id=$2
    local output_file=${3:-output.pdf}
    
    log_info "Скачивание PDF..."
    
    curl -s -b "$COOKIES_FILE" \
        -o "$output_file" \
        "$BASE_URL/download/project/$project_id/build/$build_id/output/output.pdf"
    
    if [ -f "$output_file" ]; then
        local size=$(du -h "$output_file" | cut -f1)
        log_info "✓ PDF скачан: $output_file ($size)"
    else
        log_error "✗ Ошибка скачивания PDF"
        return 1
    fi
}

# Клонировать проект
clone_project() {
    local project_id=$1
    local new_name=$2
    
    log_info "Клонирование проекта $project_id..."
    
    local response=$(post_json "/Project/$project_id/clone" \
        "{\"projectName\":\"$new_name\"}")
    
    local new_project_id=$(echo "$response" | jq -r '.project_id')
    
    if [ "$new_project_id" != "null" ]; then
        log_info "✓ Проект клонирован: $new_project_id"
        echo "$new_project_id"
    else
        log_error "✗ Ошибка клонирования"
        return 1
    fi
}

# Архивировать проект
archive_project() {
    local project_id=$1
    log_info "Архивирование проекта $project_id..."
    
    post_json "/Project/$project_id/archive" "{}"
    log_info "✓ Проект архивирован"
}

# Разархивировать проект
unarchive_project() {
    local project_id=$1
    log_info "Разархивирование проекта $project_id..."
    
    delete_request "/Project/$project_id/archive"
    log_info "✓ Проект разархивирован"
}

# Переместить в корзину
trash_project() {
    local project_id=$1
    log_info "Перемещение проекта $project_id в корзину..."
    
    post_json "/project/$project_id/trash" "{}"
    log_info "✓ Проект в корзине"
}

# Восстановить из корзины
untrash_project() {
    local project_id=$1
    log_info "Восстановление проекта $project_id из корзины..."
    
    delete_request "/project/$project_id/trash"
    log_info "✓ Проект восстановлен"
}

# Удалить проект навсегда
delete_project() {
    local project_id=$1
    log_info "Удаление проекта $project_id..."
    
    delete_request "/Project/$project_id"
    log_info "✓ Проект удалён"
}

# ==============================================
# Примеры использования
# ==============================================

# Демонстрация всех возможностей
demo() {
    log_info "=== ДЕМОНСТРАЦИЯ API OVERLEAF ==="
    echo
    
    # Вход
    login || exit 1
    echo
    
    # Список проектов
    log_info "Текущие проекты:"
    get_projects
    echo
    
    # Создание проекта
    PROJECT_ID=$(create_project "API Demo Project")
    echo
    
    # Пауза для визуализации
    sleep 1
    
    # Переименование
    rename_project "$PROJECT_ID" "API Demo Project (renamed)"
    echo
    
    # Компиляция
    BUILD_ID=$(compile_project "$PROJECT_ID")
    echo
    
    # Скачивание PDF
    if [ -n "$BUILD_ID" ]; then
        download_pdf "$PROJECT_ID" "$BUILD_ID" "demo_output.pdf"
        echo
    fi
    
    # Приглашение участника (пример - может не работать если пользователь не существует)
    # invite_member "$PROJECT_ID" "collaborator@example.com" "readAndWrite"
    # echo
    
    # Клонирование
    CLONED_ID=$(clone_project "$PROJECT_ID" "API Demo Project (clone)")
    echo
    
    # Архивирование клонированного проекта
    if [ -n "$CLONED_ID" ]; then
        archive_project "$CLONED_ID"
        echo
        
        # Разархивирование
        sleep 1
        unarchive_project "$CLONED_ID"
        echo
        
        # Удаление клонированного проекта
        trash_project "$CLONED_ID"
        echo
        
        sleep 1
        delete_project "$CLONED_ID"
        echo
    fi
    
    # Список проектов после операций
    log_info "Проекты после операций:"
    get_projects
    echo
    
    # Выход
    logout
    
    log_info "=== ДЕМОНСТРАЦИЯ ЗАВЕРШЕНА ==="
}

# ==============================================
# Интерактивное меню
# ==============================================

show_menu() {
    echo
    echo "=== Overleaf API Tool ==="
    echo "1. Войти"
    echo "2. Список проектов"
    echo "3. Создать проект"
    echo "4. Переименовать проект"
    echo "5. Компилировать проект"
    echo "6. Скачать PDF"
    echo "7. Пригласить участника"
    echo "8. Список участников"
    echo "9. Клонировать проект"
    echo "10. Архивировать проект"
    echo "11. Удалить проект"
    echo "12. Выйти"
    echo "13. Запустить демо"
    echo "0. Выход из программы"
    echo
}

interactive() {
    while true; do
        show_menu
        read -p "Выберите действие: " choice
        
        case $choice in
            1)
                login
                ;;
            2)
                get_projects
                ;;
            3)
                read -p "Название проекта: " name
                create_project "$name"
                ;;
            4)
                read -p "ID проекта: " id
                read -p "Новое название: " name
                rename_project "$id" "$name"
                ;;
            5)
                read -p "ID проекта: " id
                compile_project "$id"
                ;;
            6)
                read -p "ID проекта: " id
                read -p "Build ID: " build_id
                read -p "Имя файла (output.pdf): " filename
                filename=${filename:-output.pdf}
                download_pdf "$id" "$build_id" "$filename"
                ;;
            7)
                read -p "ID проекта: " id
                read -p "Email участника: " email
                read -p "Роль (readAndWrite/readOnly/review): " role
                role=${role:-readAndWrite}
                invite_member "$id" "$email" "$role"
                ;;
            8)
                read -p "ID проекта: " id
                get_members "$id"
                ;;
            9)
                read -p "ID проекта: " id
                read -p "Название клона: " name
                clone_project "$id" "$name"
                ;;
            10)
                read -p "ID проекта: " id
                archive_project "$id"
                ;;
            11)
                read -p "ID проекта: " id
                read -p "Вы уверены? (yes/no): " confirm
                if [ "$confirm" = "yes" ]; then
                    delete_project "$id"
                fi
                ;;
            12)
                logout
                ;;
            13)
                demo
                ;;
            0)
                log_info "До свидания!"
                exit 0
                ;;
            *)
                log_error "Неверный выбор"
                ;;
        esac
    done
}

# ==============================================
# Главная функция
# ==============================================

main() {
    if [ "$1" = "demo" ]; then
        demo
    elif [ "$1" = "help" ]; then
        echo "Использование: $0 [demo|interactive|help]"
        echo
        echo "Примеры:"
        echo "  $0 demo          - Запустить демонстрацию"
        echo "  $0 interactive   - Интерактивный режим"
        echo "  $0               - Интерактивный режим (по умолчанию)"
        echo
        echo "Переменные окружения:"
        echo "  OVERLEAF_URL      - URL Overleaf (default: http://localhost:3000)"
        echo "  OVERLEAF_EMAIL    - Email для входа (default: admin@example.com)"
        echo "  OVERLEAF_PASSWORD - Пароль (default: password)"
        echo
        echo "Доступные функции в скрипте:"
        echo "  login, logout, get_projects, create_project, rename_project"
        echo "  compile_project, download_pdf, invite_member, get_members"
        echo "  change_role, remove_member, clone_project, archive_project"
        echo "  trash_project, delete_project"
    else
        interactive
    fi
}

# Проверка зависимостей
if ! command -v jq &> /dev/null; then
    log_error "Требуется установить jq"
    log_info "Ubuntu/Debian: sudo apt-get install jq"
    log_info "macOS: brew install jq"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    log_error "Требуется установить curl"
    exit 1
fi

# Запуск
main "$@"

