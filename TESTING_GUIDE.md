# Руководство по тестированию: Защита проектов и права пользователей

## Подготовка

```bash
# Запустите Overleaf
cd develop
bin/dev web

# Откройте в браузере
open http://localhost
```

Создайте первого админа на `/launchpad` если еще не создали.

## 1. Тестирование прав пользователей

### 1.1 Создайте тестового пользователя

1. Перейдите в админ-панель: http://localhost/admin/register
2. Зарегистрируйте нового пользователя (например, `test@example.com`)
3. Перейдите на страницу списка пользователей: http://localhost/admin/users/list

### 1.2 Измените права пользователя на "Basic"

1. В списке пользователей найдите только что созданного
2. В колонке "User permissions" выберите "Basic permissions" из dropdown
3. Права должны сразу сохраниться (запрос уйдет на `/api/user/:id/permissions`)

### 1.3 Проверьте ограничения

1. Выйдите из админа и войдите под тестовым пользователем
2. **Ожидаемый результат:**
   - ❌ Кнопка "New Project" должна быть скрыта
   - ❌ Кнопка "Upload Project" должна быть скрыта
   - ✅ Существующие проекты видны и редактируются
   - ❌ Кнопка "Copy" для проектов должна быть скрыта

### 1.4 Проверьте в редакторе

1. Откройте любой существующий проект
2. **Ожидаемый результат:**
   - ❌ В меню "Project" опция "Make a Copy" должна быть неактивна
   - ❌ В левом меню кнопка "Copy Project" должна быть скрыта

### 1.5 Измените права обратно на "Full"

1. Войдите под админом
2. Перейдите в список пользователей
3. Измените права тестового пользователя обратно на "Full permissions"
4. Войдите под тестовым пользователем
5. **Ожидаемый результат:**
   - ✅ Все кнопки создания/копирования должны появиться

---

## 2. Тестирование защиты проектов

### 2.1 Через консоль браузера (самый быстрый способ)

1. Войдите под админом
2. Откройте список проектов: http://localhost/project
3. Откройте консоль браузера (F12)
4. Найдите ID проекта, который хотите защитить (в URL или в таблице)
5. Выполните в консоли:

```javascript
// Защитить проект
fetch('/api/project/PROJECT_ID_HERE/protection', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Csrf-Token': window.csrfToken || document.querySelector('meta[name="ol-csrfToken"]')?.content
  },
  body: JSON.stringify({ isProtected: true })
}).then(r => r.ok ? console.log('✅ Project protected!') : console.log('❌ Failed'))

// Проверить статус
fetch('/api/project/PROJECT_ID_HERE/protection')
  .then(r => r.json())
  .then(d => console.log('Protection status:', d))
```

### 2.2 Через curl (альтернативный способ)

```bash
# Получите cookie сессии из браузера
# В Chrome/Firefox: F12 → Application/Storage → Cookies → overleaf_session2

# Защитить проект
curl -X POST http://localhost/api/project/PROJECT_ID/protection \
  -H "Cookie: overleaf_session2=YOUR_SESSION_HERE" \
  -H "Content-Type: application/json" \
  -d '{"isProtected": true}'

# Проверить статус
curl http://localhost/api/project/PROJECT_ID/protection \
  -H "Cookie: overleaf_session2=YOUR_SESSION_HERE"
```

### 2.3 Проверьте UI

1. Обновите страницу со списком проектов
2. **Ожидаемый результат:**
   - 🔒 Рядом с названием защищённого проекта должна появиться иконка замка
   - При наведении на замок должен показаться тултип "This project is protected and cannot be deleted"

### 2.4 Попробуйте удалить защищённый проект

1. Попробуйте переместить проект в корзину
2. **Ожидаемый результат:**
   - ❌ Кнопка "Trash" должна быть скрыта для защищённого проекта

3. Попробуйте удалить через API:

```javascript
fetch('/Project/PROJECT_ID', {
  method: 'DELETE',
  headers: {
    'X-Csrf-Token': window.csrfToken
  }
}).then(r => r.json()).then(console.log)
```

4. **Ожидаемый результат:**
   - ❌ Должна вернуться ошибка 403 с сообщением "This project is protected and cannot be deleted"

### 2.5 Снимите защиту

```javascript
fetch('/api/project/PROJECT_ID/protection', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Csrf-Token': window.csrfToken
  },
  body: JSON.stringify({ isProtected: false })
}).then(r => console.log(r.ok ? '✅ Protection removed' : '❌ Failed'))
```

Обновите страницу - иконка замка должна исчезнуть, кнопка Trash появиться.

---

## 3. Тестирование защищённых файлов

### 3.1 Создайте проект с файлами

1. Создайте новый проект
2. Добавьте несколько файлов (например: main.tex, chapter1.tex, image.png)

### 3.2 Защитите файлы через API

**В консоли браузера:**

```javascript
const projectId = 'PROJECT_ID_HERE'

// Защитить файлы
fetch(`/api/project/${projectId}/protected-files`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Csrf-Token': window.csrfToken
  },
  body: JSON.stringify({
    protectedFiles: ['/main.tex', '/chapter1.tex']
  })
}).then(r => console.log(r.ok ? '✅ Files protected!' : '❌ Failed'))

// Проверить список
fetch(`/api/project/${projectId}/protected-files`)
  .then(r => r.json())
  .then(d => console.log('Protected files:', d))
```

**Или через curl:**

```bash
curl -X POST http://localhost/api/project/PROJECT_ID/protected-files \
  -H "Cookie: overleaf_session2=YOUR_SESSION" \
  -H "Content-Type: application/json" \
  -d '{
    "protectedFiles": ["/main.tex", "/chapter1.tex"]
  }'
```

### 3.3 Проверьте защиту в редакторе

1. Откройте проект в редакторе
2. Попробуйте удалить защищённый файл (main.tex):
   - Правый клик → Delete
   - **Ожидаемый результат:** Ошибка от сервера "cannot delete protected file"

3. Попробуйте переименовать защищённый файл:
   - Правый клик → Rename
   - **Ожидаемый результат:** Ошибка от сервера "cannot rename protected file"

4. Попробуйте изменить защищённый файл:
   - Попробуйте загрузить новую версию файла (если это картинка)
   - **Ожидаемый результат:** Ошибка "cannot modify protected file"

5. Попробуйте удалить НЕзащищённый файл:
   - **Ожидаемый результат:** Должно работать нормально

---

## 4. Тестирование автоматической установки прав

### 4.1 Проверьте режим по умолчанию (normal mode)

1. Создайте нового пользователя через админ-панель
2. Проверьте его права в списке пользователей
3. **Ожидаемый результат:** Должны быть "Full permissions"

### 4.2 Включите peer-review режим

**В консоли браузера (на любой странице админа):**

```javascript
// Включить peer-review режим
fetch('/admin/settings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Csrf-Token': window.csrfToken
  },
  body: JSON.stringify({
    peerReviewMode: true
  })
})
```

Или через MongoDB:

```bash
docker exec -it overleaf-mongo mongo overleaf --eval \
  'db.systemSettings.updateOne(
    {key: "peerReviewMode"},
    {$set: {value: true}},
    {upsert: true}
  )'
```

### 4.3 Создайте пользователя в peer-review режиме

1. Создайте нового пользователя через админ-панель
2. Проверьте его права
3. **Ожидаемый результат:** Должны быть "Basic permissions"

### 4.4 Выключите peer-review режим

```javascript
fetch('/admin/settings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Csrf-Token': window.csrfToken
  },
  body: JSON.stringify({
    peerReviewMode: false
  })
})
```

---

## 5. Визуальная проверка

### Что должно быть видно:

#### В списке проектов:
- ✅ **Иконка замка** (🔒) рядом с защищёнными проектами
- ✅ **Тултип** при наведении: "This project is protected and cannot be deleted"
- ✅ **Скрыта кнопка Trash** для защищённых проектов
- ✅ **Скрыта кнопка Delete** для защищённых проектов в корзине

#### В админ-панели пользователей:
- ✅ **Колонка "User permissions"** с dropdown
- ✅ **Две опции**: "Full permissions" и "Basic permissions"
- ✅ **Иконка info** в заголовке колонки с описанием
- ✅ **Изменения сохраняются** сразу при выборе

#### Для пользователей с Basic permissions:
- ❌ **Скрыта кнопка "New Project"** на главной
- ❌ **Скрыта кнопка "Upload Project"**
- ❌ **Скрыта кнопка "Copy"** для проектов
- ❌ **Неактивна опция "Make a Copy"** в меню редактора

---

## 6. Проверка граничных случаев

### 6.1 Несколько админов

1. Создайте второго админа
2. Войдите под ним
3. Попробуйте изменить права первого админа
4. **Ожидаемый результат:** Должно работать

### 6.2 Пользователь сам себе

1. Войдите как обычный пользователь
2. Попробуйте вызвать API изменения своих прав:

```javascript
fetch('/api/user/YOUR_USER_ID/permissions', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({permissions: 'full'})
})
```

3. **Ожидаемый результат:** Должна быть ошибка 403 (только админы могут менять права)

### 6.3 Защита несуществующего проекта

```javascript
fetch('/api/project/nonexistent123/protection', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'X-Csrf-Token': window.csrfToken},
  body: JSON.stringify({isProtected: true})
})
```

3. **Ожидаемый результат:** Ошибка 404 или 500

---

## 7. Быстрый тест-сценарий (5 минут)

```bash
# 1. Создайте тестового пользователя
# Админка → Register → test@example.com

# 2. Измените права на Basic
# User List → dropdown → Basic permissions

# 3. Войдите под test@example.com
# Проверьте что кнопка "New Project" скрыта ✓

# 4. Защитите проект (в консоли браузера под админом)
fetch('/api/project/PROJECT_ID/protection', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'X-Csrf-Token': window.csrfToken},
  body: JSON.stringify({isProtected: true})
})

# 5. Обновите страницу проектов
# Должна появиться иконка замка 🔒 ✓

# 6. Проверьте что кнопка Trash скрыта ✓

# 7. Защитите файл main.tex
fetch('/api/project/PROJECT_ID/protected-files', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'X-Csrf-Token': window.csrfToken},
  body: JSON.stringify({protectedFiles: ['/main.tex']})
})

# 8. В редакторе попробуйте удалить main.tex
# Должна быть ошибка "cannot delete protected file" ✓
```

Если все 8 пунктов прошли успешно - система работает! ✅

---

## Troubleshooting

### Проблема: API возвращает 401 или 403
**Решение:** Убедитесь что вы вошли под админом. Только админы могут использовать API защиты.

### Проблема: Изменения не видны после обновления страницы
**Решение:** Очистите кеш браузера (Ctrl+Shift+R) или откройте в режиме инкогнито.

### Проблема: Иконка замка не появляется
**Решение:** Проверьте в консоли браузера, что данные проекта содержат `isProtected: true`.

### Проблема: Dropdown прав не работает
**Решение:** Проверьте консоль на ошибки. Убедитесь что API эндпоинт доступен.

### Проблема: Не могу найти PROJECT_ID
**Решение:**
- В списке проектов: наведите на проект и посмотрите URL
- В редакторе: ID в URL после `/project/`
- В консоли: `window.project_id` или `window.data.project.id`

---

## Полезные команды для отладки

```javascript
// В консоли браузера:

// Получить текущий проект
console.log(window.project_id)

// Получить CSRF токен
console.log(window.csrfToken)

// Получить ID текущего пользователя
console.log(window.user_id)

// Проверить права текущего пользователя
fetch('/api/user/' + window.user_id + '/permissions')
  .then(r => r.json())
  .then(console.log)

// Получить список всех пользователей (только админ)
fetch('/admin/users/list?page=1&limit=100')
  .then(r => r.json())
  .then(console.log)
```

---

## Результаты успешного тестирования

После прохождения всех тестов должны быть выполнены:

- ✅ Пользователи с basic правами не могут создавать/загружать/копировать проекты
- ✅ Пользователи с full правами могут делать всё
- ✅ Админы могут менять права через UI
- ✅ Защищённые проекты нельзя удалить (UI + API)
- ✅ Иконка замка отображается для защищённых проектов
- ✅ Защищённые файлы нельзя удалять/переименовывать/изменять
- ✅ Новые пользователи получают права в зависимости от peer-review режима
- ✅ Все изменения сохраняются в базе данных
- ✅ Система работает корректно после перезагрузки

**Если всё работает - поздравляю, реализация успешна! 🎉**
