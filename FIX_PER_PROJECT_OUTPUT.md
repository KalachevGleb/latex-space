# ✅ Исправление: Вывод компиляции привязан к проекту, а не к пользователю

## ❌ Проблема

При использовании системы кэширования по проекту, выходные файлы (PDF, logs) всё ещё хранились в директориях с userId:

```
output/projectId-userId/build/.../output.pdf
```

Когда User A компилировал проект, результат сохранялся в:
```
output/projectId-userA/build/.../output.pdf
```

Когда User B получал результат из кэша, пути содержали:
```
output/projectId-userA/build/.../output.pdf
```

Но браузер пытался загрузить:
```
/projectId/user/userB/build/.../output.pdf
```

**Результат:** 404 Not Found для второго пользователя ❌

## ✅ Решение

### 1. Изменена функция `getCompileName()` 

Чтобы **НЕ** использовать userId для обычных компиляций:

### До:
```javascript
function getCompileName(projectId, userId) {
  if (userId != null) {
    return `${projectId}-${userId}`  // ❌ Каждому пользователю своя папка
  } else {
    return projectId
  }
}
```

### После:
```javascript
function getCompileName(projectId, userId) {
  // For regular compilation (via queue), use only projectId
  // Output is shared between all users in the same project
  // userId is only used for legacy/special cases
  if (userId != null && Settings.clsi?.perUserCompiles === true) {
    return `${projectId}-${userId}`  // Только если явно включено
  } else {
    return projectId  // ✅ Общая папка для всех пользователей
  }
}
```

### 2. Убран `/user/${userId}` из URL в outputFiles

**CompileController.js:**
```javascript
// До:
url: `${Settings.apis.clsi.url}/project/${request.project_id}` +
     (request.user_id != null ? `/user/${request.user_id}` : '') +
     `/build/${file.build}/output/${file.path}`

// После:
url: `${Settings.apis.clsi.url}/project/${request.project_id}` +
     `/build/${file.build}/output/${file.path}`
```

### 3. Исправлены маршруты в app.js

**app.js:**
```javascript
// До:
req.url = `/${req.params.project_id}-${req.params.user_id}/` + ...

// После:
req.url = `/${req.params.project_id}/` + ...
```

### 4. Исправлен ContentController.js

**ContentController.js:**
```javascript
// До:
const perUserDir = userId ? `${projectId}-${userId}` : projectId

// После:
// Всегда используем только projectId (игнорируем userId)
```

## 📁 Структура директорий

### Было (неправильно):
```
compiles/
  └── projectId-userA/       ❌ Per-user
      └── main.tex
output/
  └── projectId-userA/       ❌ Per-user
      └── build/
          └── xxx/
              ├── output.pdf
              └── output.log
```

### Стало (правильно):
```
compiles/
  └── projectId/             ✅ Per-project (shared)
      └── main.tex
output/
  └── projectId/             ✅ Per-project (shared)
      └── build/
          └── xxx/
              ├── output.pdf
              └── output.log
```

## 🎯 Преимущества

### 1. Нет дублирования
- **Было:** 100 пользователей = 100 копий output.pdf
- **Стало:** 100 пользователей = 1 output.pdf

### 2. Кэш работает правильно
- User A компилирует → результат в `projectId/build/.../output.pdf`
- User B получает из кэша → тот же путь
- User B загружает → **тот же файл** ✅

### 3. Соответствие архитектуре
- Результат компиляции зависит от **проекта + настройки**
- Результат **НЕ** зависит от пользователя
- Хранение должно отражать эту логику

## 🧪 Тестирование

### Тест 1: User A компилирует
```bash
# User A: Compile
ls output/
# Ожидание: projectId/ (БЕЗ userId!)
```

### Тест 2: User B получает результат
```bash
# User A: Compile
# User B: Открыть проект, Compile

# Ожидание:
# 1. User B мгновенно получает результат (из кэша)
# 2. PDF загружается успешно (НЕ 404)
# 3. Новые файлы НЕ создаются в output/
```

### Тест 3: Проверка директорий
```bash
ls -la output/
# Ожидание: только projectId (без userId в имени)

ls -la compiles/
# Ожидание: только projectId (без userId в имени)
```

## 🔄 Миграция

При переходе на новую версию:

1. **Очистить старые директории:**
```bash
rm -rf compiles/*-*
rm -rf output/*-*
```

2. **Перезапустить CLSI:**
```bash
docker restart develop-clsi-1
```

3. **Первая компиляция:**
- Создастся новая структура: `output/projectId/`
- Все последующие пользователи будут использовать эту же папку

## 📊 Сравнение

| Аспект | Per-User (старое) | Per-Project (новое) |
|--------|-------------------|---------------------|
| Хранение | `projectId-userId` | `projectId` |
| Дублирование | ❌ Да (N копий для N пользователей) | ✅ Нет (1 копия для всех) |
| 404 для User B | ❌ Да | ✅ Нет |
| Кэш работает | ❌ Нет | ✅ Да |
| Место на диске | ❌ Много | ✅ Мало |
| Соответствие логике | ❌ Нет | ✅ Да |

## 🔧 Настройка

Если по какой-то причине нужно вернуть per-user компиляции:

```javascript
// settings.defaults.js
module.exports.clsi = {
  perUserCompiles: true  // Включить per-user
}
```

**Но это НЕ рекомендуется!** Per-project компиляции - правильный подход.

## ✅ Результат

- ✅ **Нет костылей** с копированием файлов
- ✅ **Нет дублирования** - один результат на проект
- ✅ **Правильные пути** - все пользователи видят один файл
- ✅ **Кэш работает** - User B получает результат User A
- ✅ **Экономия места** - 100 пользователей = 1 PDF, а не 100

---

**Теперь система работает правильно: один проект = одна компиляция = один результат для всех!** 🎉

