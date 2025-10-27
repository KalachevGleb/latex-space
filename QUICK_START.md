# 🚀 Быстрый старт

## Запуск системы

```bash
cd develop
bin/dev web
# Откройте http://localhost
```

## Первый запуск

1. Создайте админа: http://localhost/launchpad
2. Войдите под админом

## Основные функции

### 1. Управление правами пользователей

**Откройте:** http://localhost/admin/users/list

**Что делать:**
- Найдите пользователя в таблице
- В колонке "User permissions" выберите из dropdown:
  - **Full permissions** = может создавать/загружать/копировать проекты
  - **Basic permissions** = только редактирует существующие проекты

**Изменения сохраняются автоматически!**

### 2. Защита проектов (через консоль браузера)

Откройте консоль (F12) на любой странице админа:

```javascript
// Защитить проект (не может быть удалён)
fetch('/api/project/PROJECT_ID/protection', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Csrf-Token': window.csrfToken
  },
  body: JSON.stringify({ isProtected: true })
})

// Снять защиту
fetch('/api/project/PROJECT_ID/protection', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Csrf-Token': window.csrfToken
  },
  body: JSON.stringify({ isProtected: false })
})
```

**Результат:**
- 🔒 Иконка замка в списке проектов
- ❌ Кнопки "Trash" и "Delete" скрыты

### 3. Защита файлов (через консоль браузера)

```javascript
// Защитить файлы в проекте
fetch('/api/project/PROJECT_ID/protected-files', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Csrf-Token': window.csrfToken
  },
  body: JSON.stringify({
    protectedFiles: ['/main.tex', '/chapters/intro.tex']
  })
})

// Получить список защищённых файлов
fetch('/api/project/PROJECT_ID/protected-files')
  .then(r => r.json())
  .then(console.log)
```

**Результат:**
- ❌ Нельзя удалить защищённый файл
- ❌ Нельзя переименовать защищённый файл
- ❌ Нельзя заменить защищённый файл

## Как найти PROJECT_ID?

**Вариант 1:** В URL редактора
```
http://localhost/project/507f1f77bcf86cd799439011
                        ↑ это и есть PROJECT_ID
```

**Вариант 2:** В консоли браузера
```javascript
// На странице редактора:
console.log(window.project_id)
```

**Вариант 3:** В списке проектов
- Наведите на проект
- Посмотрите URL в строке состояния браузера

## Быстрый тест (2 минуты)

```bash
# 1. Создайте пользователя через админку
# http://localhost/admin/register → test@example.com

# 2. Измените права на Basic
# http://localhost/admin/users/list → dropdown → Basic

# 3. Войдите под test@example.com
# Кнопка "New Project" должна быть скрыта ✓

# 4. Войдите обратно под админом
# Откройте консоль (F12) и выполните:

fetch('/api/project/YOUR_PROJECT_ID/protection', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Csrf-Token': window.csrfToken
  },
  body: JSON.stringify({ isProtected: true })
})

# 5. Обновите страницу проектов
# Иконка замка 🔒 должна появиться ✓
```

## Полезные команды (в консоли браузера)

```javascript
// Получить CSRF токен
window.csrfToken

// Получить ID текущего пользователя
window.user_id

// Получить ID текущего проекта (в редакторе)
window.project_id

// Проверить права пользователя
fetch('/api/user/' + window.user_id + '/permissions')
  .then(r => r.json())
  .then(console.log)
```

## Что дальше?

### Для подробного тестирования
→ [TESTING_GUIDE.md](TESTING_GUIDE.md)

### Для изучения API
→ [API_PROTECTION_PERMISSIONS.md](API_PROTECTION_PERMISSIONS.md)

### Для понимания реализации
→ [IMPLEMENTATION_SUMMARY_RU.md](IMPLEMENTATION_SUMMARY_RU.md)

### Полный обзор
→ [COMPLETE_IMPLEMENTATION_SUMMARY.md](COMPLETE_IMPLEMENTATION_SUMMARY.md)

## Troubleshooting

**Не работает API:** Убедитесь что вы вошли под админом

**Не видно изменений:** Обновите страницу (Ctrl+Shift+R)

**Не могу найти PROJECT_ID:** Откройте проект и посмотрите в URL

**403 ошибка:** Только админы могут использовать API защиты

---

**Готово! Всё работает через UI и простые скрипты.** 🎉
