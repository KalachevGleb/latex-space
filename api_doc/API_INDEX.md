# 📚 Overleaf CE API - Полный индекс документации

## 🎯 Для кого эта документация?

- **Начинающие:** Начните с [API_README.md](API_README.md) и используйте [api-example.sh](api-example.sh)
- **Разработчики Python:** Используйте [overleaf_api.py](overleaf_api.py) и запустите [api_examples.py](api_examples.py)
- **Системные администраторы:** См. [API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md) для быстрого доступа
- **Опытные пользователи:** Полная документация в [API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md)

---

## 📖 Документация

### 🌟 Начните здесь

**[API_README.md](API_README.md)** - Основное руководство
- ✅ Быстрый старт за 5 минут
- ✅ Установка зависимостей
- ✅ Первые шаги с API
- ✅ Решение типичных проблем

**Размер:** 11 KB | **Строк:** 422

---

### 📘 Полная документация

**[API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md)** - Исчерпывающее руководство
- ✅ Все API endpoints с описанием
- ✅ Параметры запросов и форматы ответов
- ✅ Примеры на Bash, Node.js, Python
- ✅ Аутентификация и безопасность
- ✅ Rate limits и troubleshooting
- ✅ WebSocket API

**Размер:** 22 KB | **Строк:** 867

**Включает:**
- Базовая информация и форматы данных
- Аутентификация (Web API + Private API)
- Управление пользователями
- Управление проектами (CRUD операции)
- Управление участниками и ролями
- Компиляция и скачивание файлов
- Private API endpoints
- 4 готовых примера использования

---

### 📋 Справочники

**[API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md)** - Краткий справочник
- ✅ Таблицы всех endpoints
- ✅ HTTP коды ответов
- ✅ Роли участников
- ✅ Rate limits
- ✅ Быстрые примеры команд

**Размер:** 6.2 KB | **Строк:** 177

**Идеально для:**
- Быстрого поиска endpoint'а
- Проверки формата запроса
- Копирования примеров команд

---

**[API_SUMMARY.md](API_SUMMARY.md)** - Резюме и примеры
- ✅ Обзор всех компонентов
- ✅ Типичные задачи и решения
- ✅ Примеры автоматизации
- ✅ Best practices

**Размер:** 15 KB | **Строк:** 489

**Содержит примеры:**
- Автоматизация создания проектов для студентов
- Пакетная компиляция проектов
- Резервное копирование проектов

---

## 🛠️ Готовые инструменты

### 🐚 Bash скрипт

**[api-example.sh](api-example.sh)** - Интерактивный shell инструмент

**Размер:** 16 KB | **Строк:** 538

**Возможности:**
- ✅ Интерактивное меню
- ✅ Демонстрационный режим
- ✅ Готовые функции для использования в скриптах
- ✅ Цветной вывод и обработка ошибок

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

### 🐍 Python модуль

**[overleaf_api.py](overleaf_api.py)** - Python клиент для Overleaf API

**Размер:** 25 KB | **Строк:** 710

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

**Размер:** 76 B | **Строк:** 4

```txt
requests>=2.31.0
```

**Установка:**
```bash
pip install -r requirements_api.txt
```

---

## 🚀 Быстрый старт по сценариям

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

## 📊 Статистика документации

| Файл | Размер | Строки | Назначение |
|------|--------|--------|------------|
| API_DOCUMENTATION_RU.md | 22 KB | 867 | Полная документация |
| API_QUICK_REFERENCE.md | 6.2 KB | 177 | Краткий справочник |
| API_README.md | 11 KB | 422 | Руководство |
| API_SUMMARY.md | 15 KB | 489 | Резюме и примеры |
| api-example.sh | 16 KB | 538 | Bash инструмент |
| overleaf_api.py | 25 KB | 710 | Python модуль |
| api_examples.py | 16 KB | 459 | Python примеры |
| requirements_api.txt | 76 B | 4 | Зависимости |
| **ВСЕГО** | **~110 KB** | **~3,700** | **8 файлов** |

---

## 🔗 Связанные документы

В репозитории также доступны:
- `ARCHITECTURE_RU.md` - Архитектура Overleaf
- `COMPILATION_QUEUE_FINAL_SUMMARY_RU.md` - Система компиляции
- `REVIEW_PANEL_MATHJAX_README.md` - Review Panel функционал
- Другие документы по настройке и использованию

---

## 📞 Поддержка

### Если возникли проблемы:

1. **Проверьте Troubleshooting** в [API_README.md](API_README.md#troubleshooting)
2. **Изучите примеры** в [API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md#примеры-использования)
3. **Запустите демо** `./api-example.sh demo`
4. **Проверьте логи** Overleaf: `bin/dev logs`
5. **Создайте issue** на GitHub: https://github.com/overleaf/overleaf/issues

### Полезные ссылки:

- **Overleaf CE Wiki:** https://github.com/overleaf/overleaf/wiki
- **GitHub Issues:** https://github.com/overleaf/overleaf/issues
- **Community Forum:** https://github.com/overleaf/overleaf/discussions

---

## ⚡ Быстрые команды

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

## 📝 Обновления

**Версия:** 1.0  
**Дата:** 2024-10-12  
**Совместимость:** Overleaf CE (latest main branch)

**Что нового в v1.0:**
- ✅ Полная документация всех публичных API
- ✅ Bash скрипт с интерактивным режимом
- ✅ Python модуль с полным функционалом
- ✅ 6 готовых примеров использования
- ✅ Поддержка Web API и Private API
- ✅ Обработка ошибок и rate limits
- ✅ Документация на русском языке

---

## 📄 Лицензия

Документация распространяется вместе с Overleaf CE под лицензией AGPL-3.0.

---

## ✨ Начните прямо сейчас!

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

---

**Выберите нужный инструмент и начинайте работу с Overleaf API!** 🚀

