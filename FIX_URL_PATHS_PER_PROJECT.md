# 🔧 Исправление: URL и пути теперь per-project

## ❌ Проблема

После изменения хранения файлов на per-project (не per-user), frontend всё ещё получал URL с `/user/${userId}`:

```
/project/68e999d.../user/68e9653.../build/199d429.../output/output.pdf
```

Но файлы реально лежали в:
```
output/68e999d.../build/199d429.../output/output.pdf
```

**Результат:** 404 для **обоих** пользователей ❌

## ✅ Решение

Внесены изменения в 4 местах:

### 1. CompileManager.js
```javascript
function getCompileName(projectId, userId) {
  // По умолчанию используем только projectId
  if (userId != null && Settings.clsi?.perUserCompiles === true) {
    return `${projectId}-${userId}`
  } else {
    return projectId  // ✅
  }
}
```

### 2. CompileController.js
```javascript
// URL без /user/${userId}
outputFiles: outputFiles.map(file => ({
  url:
    `${Settings.apis.clsi.url}/project/${request.project_id}` +
    `/build/${file.build}/output/${file.path}`,  // ✅ Нет /user/
  ...file,
}))
```

### 3. app.js (маршрут с userId)
```javascript
app.get(
  '/project/:project_id/user/:user_id/build/:build_id/output/*',
  function (req, res, next) {
    // Игнорируем user_id, используем только project_id
    req.url = `/${req.params.project_id}/` + ...  // ✅
    staticOutputServer(req, res, next)
  }
)
```

### 4. ContentController.js
```javascript
function getPdfRange(req, res, next) {
  const { projectId, userId, contentId, hash } = req.params
  // Игнорируем userId
  const path = Path.join(
    Settings.path.outputDir,
    projectId,  // ✅ Только projectId
    OutputCacheManager.CONTENT_SUBDIR,
    contentId,
    hash
  )
  // ...
}
```

## 🎯 Что это даёт

### До:
```
URL:  /project/A/user/U1/build/B/output.pdf
Path: output/A-U1/build/B/output.pdf ❌ (каждому пользователю свой)
```

### После:
```
URL:  /project/A/build/B/output.pdf
Path: output/A/build/B/output.pdf ✅ (общий для всех)
```

## 📝 Изменённые файлы

1. **services/clsi/app/js/CompileManager.js**
   - `getCompileName()` - использует только projectId по умолчанию

2. **services/clsi/app/js/CompileController.js**
   - `compile()` - URL без `/user/${userId}`

3. **services/clsi/app.js**
   - Маршрут `/project/:project_id/user/:user_id/build/...` - игнорирует userId

4. **services/clsi/app/js/ContentController.js**
   - `getPdfRange()` - использует только projectId

## 🧪 Тестирование

### Тест 1: User A компилирует
```bash
# User A: Compile
# Проверить URL в response:
# Ожидание: /project/XXX/build/YYY/output.pdf (БЕЗ /user/)
```

### Тест 2: User B открывает проект
```bash
# User B: Открыть проект, Compile
# Ожидание: PDF загружается успешно (НЕ 404) ✅
```

### Тест 3: Проверка файлов
```bash
ls -la output/
# Ожидание: projectId (БЕЗ userId в имени директории)

ls -la output/projectId/build/
# Ожидание: buildId директория с output.pdf
```

## ✅ Результат

| Проблема | Решение |
|----------|---------|
| ❌ 404 у обоих пользователей | ✅ URL корректные, без `/user/` |
| ❌ URL содержат `/user/${userId}` | ✅ URL только с projectId |
| ❌ Маршруты ищут файлы в `projectId-userId` | ✅ Маршруты ищут в `projectId` |
| ❌ ContentController использует per-user paths | ✅ Использует только projectId |

**Теперь все компоненты согласованы: хранение, URL и маршруты используют только projectId!** 🎉

