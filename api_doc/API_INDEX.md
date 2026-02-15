# Overleaf CE API - Полный индекс документации

## Для кого эта документация?

- **Начинающие:** Начните с [API_README.md](API_README.md) и используйте [api-example.sh](api-example.sh)
- **Разработчики Python:** Используйте [overleaf_api.py](overleaf_api.py) и запустите [api_examples.py](api_examples.py)
- **Системные администраторы:** См. [API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md) для быстрого доступа
- **Опытные пользователи:** Полная документация в [API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md)

---

## Документация

### Начните здесь

**[API_README.md](API_README.md)** - Основное руководство
- Быстрый старт
- Установка зависимостей
- Первые шаги с API
- Решение проблем

---

### Service-to-Service API

**[SERVICE_TO_SERVICE_API.md](SERVICE_TO_SERVICE_API.md)** - Интеграция с другими сервисами
- Аутентификация без браузерной сессии
- Все Web API endpoints через `/service/` префикс
- HTTP Basic Auth + заголовок `X-Overleaf-User-Id`
- Примеры на Python, Node.js, Bash

**Для:** Backend-to-backend интеграции, автоматизации, peer-review систем

---

### Полная документация

**[API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md)** - Справочник всех endpoints
- Все API endpoints с параметрами и ответами
- Примеры на Bash, Node.js, Python
- Аутентификация и безопасность
- Rate limits и troubleshooting

**Включает:** Управление пользователями, проектами, участниками, компиляция, защита проектов/файлов, управление правами, Private API

---

### Справочники

**[API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md)** - Краткий справочник
- Таблицы всех endpoints
- HTTP коды ответов
- Роли участников
- Быстрые примеры команд

**[API_SUMMARY.md](API_SUMMARY.md)** - Примеры использования
- Типичные задачи и решения
- Автоматизация
- Best practices

---

## Готовые инструменты

### Bash скрипт

**[api-example.sh](api-example.sh)** - Интерактивный shell инструмент с готовыми функциями

**Запуск:**
```bash
# Интерактивный режим
./api-example.sh

# Демо всех возможностей
./api-example.sh demo

# Справка
./api-example.sh help

# Использование в своих скриптах
source api-example.sh
login
PROJECT_ID=$(create_project "My Project")
```

**Функции:**
- `login` / `logout` - Вход/выход
- `get_projects` - Список проектов
- `create_project` - Создать проект
- `rename_project` - Переименовать
- `compile_project` - Компилировать
- `download_pdf` - Скачать PDF
- `invite_member` - Пригласить участника
- `get_members` - Список участников
- `change_role` - Изменить роль
- `clone_project` - Клонировать проект
- `archive_project` / `unarchive_project` - Архивирование
- `trash_project` / `untrash_project` - Корзина
- `delete_project` - Удаление

---

### Python модуль

**[overleaf_api.py](overleaf_api.py)** - Python клиент для Overleaf API

**Классы:**
- `OverleafAPI` - Основной Web API клиент
- `OverleafPrivateAPI` - Private API клиент
- `OverleafAPIError` - Базовое исключение
- `AuthenticationError` - Ошибка входа
- `ProjectError` - Ошибка операций с проектом
- `CompilationError` - Ошибка компиляции

**Основные методы OverleafAPI:**

**Аутентификация:**
- `login(email, password)` - Вход
- `logout()` - Выход
- `get_user_info()` - Информация о пользователе

**Проекты:**
- `list_projects()` - Список проектов
- `create_project(name, template='basic')` - Создать
- `rename_project(project_id, new_name)` - Переименовать
- `get_project_entities(project_id)` - Структура
- `clone_project(project_id, new_name)` - Клонировать
- `delete_project(project_id)` - Удалить
- `archive_project(project_id)` - Архивировать
- `unarchive_project(project_id)` - Разархивировать
- `trash_project(project_id)` - В корзину
- `untrash_project(project_id)` - Из корзины

**Участники:**
- `get_members(project_id)` - Список участников
- `invite_collaborator(project_id, email, privileges)` - Пригласить
- `change_member_role(project_id, user_id, privilege_level)` - Изменить роль
- `remove_member(project_id, user_id)` - Удалить

**Компиляция:**
- `compile_project(project_id, **options)` - Компилировать
- `stop_compilation(project_id)` - Остановить
- `download_pdf(project_id, build_id, output_path)` - Скачать PDF
- `download_output_file(project_id, build_id, filename)` - Скачать файл
- `get_word_count(project_id)` - Статистика слов

**Пример использования:**
```python
from overleaf_api import OverleafAPI

api = OverleafAPI('http://localhost:3000', 'user@example.com', 'password')

# Создать проект
project_id = api.create_project('My LaTeX Project')

# Компилировать
build_id = api.compile_project(project_id)

# Скачать PDF
api.download_pdf(project_id, build_id, 'output.pdf')

# Пригласить участника
api.invite_collaborator(project_id, 'colleague@example.com', 'readAndWrite')

api.logout()
```

---

**[api_examples.py](api_examples.py)** - Готовые примеры использования

**Размер:** 16 KB | **Строк:** 459

**6 интерактивных примеров:**

1. **Базовый workflow** - Создание, компиляция, скачивание
2. **Работа с участниками** - Приглашение, роли, удаление
3. **Управление проектами** - CRUD операции, клонирование
4. **Расширенная компиляция** - Параметры, статистика
5. **Private API** - Работа с документами
6. **Обработка ошибок** - Best practices

**Запуск:**
```bash
pip install -r requirements_api.txt
python api_examples.py
```

**Использование отдельных функций:**
```python
from api_examples import example_basic_workflow, example_collaboration

example_basic_workflow()
example_collaboration()
```

---

**[requirements_api.txt](requirements_api.txt)** - Python зависимости

```txt
requests>=2.31.0
```

**Установка:**
```bash
pip install -r requirements_api.txt
```

---

## Быстрый старт

### Сценарий 1: Первый запуск (новичок)

```bash
# 1. Установите зависимости
sudo apt-get install curl jq  # Ubuntu/Debian
# или
brew install curl jq          # macOS

# 2. Запустите демо
./api-example.sh demo

# 3. Изучите документацию
cat API_README.md
```

### Сценарий 2: Автоматизация через Bash

```bash
# 1. Подключите библиотеку функций
source api-example.sh

# 2. Используйте в своих скриптах
#!/bin/bash
source api-example.sh

login
PROJECT_ID=$(create_project "Auto Project")
compile_project "$PROJECT_ID"
download_pdf "$PROJECT_ID" "$BUILD_ID" "result.pdf"
logout
```

### Сценарий 3: Python разработка

```bash
# 1. Установите зависимости
pip install -r requirements_api.txt

# 2. Запустите примеры
python api_examples.py

# 3. Используйте в своём коде
from overleaf_api import OverleafAPI

api = OverleafAPI('http://localhost:3000', 'user@email.com', 'pass')
project_id = api.create_project('Test')
```

### Сценарий 4: Private API (продвинутый)

```python
from overleaf_api import OverleafPrivateAPI

api = OverleafPrivateAPI(
    username='overleaf',
    password='your-password'
)

# Работа с документами
details = api.get_project_details(project_id)
doc = api.get_document(project_id, doc_id)
api.update_document(project_id, doc_id, new_lines, version + 1)
```

---


## Связанные документы

В репозитории также доступны:
- `ARCHITECTURE_RU.md` - Архитектура Overleaf
- `COMPILATION_QUEUE_FINAL_SUMMARY_RU.md` - Система компиляции
- `REVIEW_PANEL_MATHJAX_README.md` - Review Panel функционал
- Другие документы по настройке и использованию

---

## Поддержка

### Если возникли проблемы:

1. **Проверьте Troubleshooting** в [API_README.md](API_README.md#troubleshooting)
2. **Изучите примеры** в [API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md#примеры-использования)
3. **Запустите демо** `./api-example.sh demo`
4. **Проверьте логи** Overleaf: `bin/dev logs`

### Полезные ссылки:

- **Overleaf CE Wiki:** https://github.com/overleaf/overleaf/wiki
- **GitHub Issues:** https://github.com/overleaf/overleaf/issues
- **Community Forum:** https://github.com/overleaf/overleaf/discussions

Однако эти ресурсы относятся к основному репозиторию Overleaf, а не к данному Fork'у, там не может быть ответов на вопросы относительно добавленного функционала.

---

## Быстрые команды

### Bash
```bash
# Войти и создать проект
source api-example.sh && login && create_project "Test"

# Демо режим
./api-example.sh demo

# Получить список проектов
source api-example.sh && login && get_projects
```

### Python
```python
# Быстрый тест
python3 -c "from overleaf_api import OverleafAPI; api = OverleafAPI('http://localhost:3000', 'user@e.com', 'pass'); print(api.list_projects())"

# Запустить примеры
python api_examples.py

# Создать проект из командной строки
python3 -c "from overleaf_api import OverleafAPI; api = OverleafAPI('http://localhost:3000', 'u@e.com', 'p'); print(api.create_project('CLI Test'))"
```

### cURL
```bash
# Login и получение CSRF
CSRF=$(curl -s http://localhost:3000/dev/csrf)
curl -c c.txt -b c.txt -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" -d '{"email":"u@e.com","password":"p"}' http://localhost:3000/login

# Создать проект
curl -b c.txt -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" -d '{"projectName":"Test"}' http://localhost:3000/project/new
```

---

## Обновления

**Версия:** 2.1
**Дата:** 2026-01-24
**Совместимость:** Overleaf CE (latest main branch)

**Что нового в v2.1:**
- ✨ **Service-to-Service API:** Новый способ интеграции без браузерной сессии
- ✅ Все Web API endpoints доступны через `/service/` префикс
- ✅ Аутентификация через HTTP Basic Auth + `X-Overleaf-User-Id`
- ✅ Готовые клиенты на Python, Node.js, Bash
- ✅ Примеры интеграции с peer-review системами
- ✅ Полная документация в [SERVICE_TO_SERVICE_API.md](SERVICE_TO_SERVICE_API.md)

**Что было в v2.0:**
- ✅ **Защита проектов и файлов:** API для установки защищённых проектов и файлов
- ✅ **Управление правами пользователей:** Система прав `full` и `basic`
- ✅ **Read-only режим:** Защищённые файлы автоматически открываются в read-only
- ✅ **UI улучшения:** Визуальные индикаторы защищённых файлов, toggle для скрытия
- ✅ 7 готовых примеров использования (добавлены примеры для новых API)

**Что было в v1.0:**
- ✅ Полная документация всех публичных API
- ✅ Bash скрипт с интерактивным режимом
- ✅ Python модуль с полным функционалом
- ✅ 6 готовых примеров использования
- ✅ Поддержка Web API и Private API
- ✅ Обработка ошибок и rate limits
- ✅ Документация на русском языке

---

## Начните прямо сейчас!

**Для новичков:**
```bash
./api-example.sh demo
```

**Для разработчиков:**
```bash
pip install -r requirements_api.txt
python api_examples.py
```

**Для опытных пользователей:**
```bash
source api-example.sh
# Используйте любые функции из скрипта
```
