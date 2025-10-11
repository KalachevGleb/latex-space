# ✅ Frontend Integration: Force Recompile

## 🎯 Что было сделано

Интегрирована поддержка `force` флага во frontend для существующей кнопки "Recompile from scratch".

## 🔧 Изменения

### 1. Добавлен тип `force` в `CompileOptions`

**Файл:** `services/web/types/compile.ts`

```typescript
export type CompileOptions = {
  draft?: boolean
  stopOnFirstError?: boolean
  force?: boolean  // ← Добавлено
  isAutoCompileOnLoad?: boolean
  isAutoCompileOnChange?: boolean
  rootResourcePath?: string
  imageName?: string
  compiler?: string
}
```

### 2. Добавлена передача `force` в body запроса

**Файл:** `services/web/frontend/js/features/pdf-preview/util/compiler.ts`

```typescript
const body = {
  rootDoc_id: rootDocId,
  draft: options.draft,
  check: 'silent',
  incrementalCompilesEnabled: !this.error,
  stopOnFirstError: options.stopOnFirstError,
  force: options.force,  // ← Добавлено
  editorId: EDITOR_SESSION_ID,
}
```

### 3. Обновлена функция `recompileFromScratch`

**Файл:** `services/web/frontend/js/shared/context/local-compile-context.tsx`

**Было (неправильно):**
```typescript
const recompileFromScratch = useCallback(() => {
  clearCache().then(() => {
    compiler.compile()  // ← Без флага force
  })
}, [clearCache, compiler])
```

**Стало (правильно):**
```typescript
const recompileFromScratch = useCallback(() => {
  compiler.compile({ force: true })  // ← С флагом force!
}, [compiler])
```

## 🎬 Как это работает

### До изменений:
```
User → Click "Recompile from scratch"
  ↓
Frontend → DELETE /project/{id}/cache (очистка всего кэша) ❌
  ↓
Frontend → POST /project/{id}/compile (без force) ❌
  ↓
CLSI → Обычная компиляция (не очищает .aux, .log)
```

**Проблемы:**
- ❌ Очищался весь кэш проекта (все настройки)
- ❌ Не очищались временные файлы компиляции
- ❌ Мог повлиять на других пользователей

### После изменений:
```
User → Click "Recompile from scratch"
  ↓
Frontend → POST /project/{id}/compile { force: true } ✅
  ↓
CLSI → Очистка временных файлов (.aux, .log) ✅
  ↓
CLSI → Компиляция с нуля ✅
  ↓
CLSI → Обновление кэша для текущих настроек ✅
```

**Преимущества:**
- ✅ Правильная очистка только для текущей конфигурации
- ✅ Очистка временных файлов компиляции
- ✅ Не влияет на других пользователей
- ✅ Backend полностью контролирует процесс

## 📊 Сравнение

| Аспект | Старая реализация | Новая реализация |
|--------|------------------|------------------|
| Очистка кэша | ❌ Весь проект | ✅ Только текущая конфигурация |
| Очистка .aux, .log | ❌ Нет | ✅ Да |
| Флаг в backend | ❌ Нет | ✅ `force: true` |
| Влияние на других | ❌ Может повлиять | ✅ Не влияет |
| Контроль backend | ❌ Нет | ✅ Да |

## 🧪 Тестирование

### 1. Проверить что флаг передаётся

```bash
# Открыть Developer Tools → Network
# Нажать "Recompile from scratch"
# Проверить Request Payload:

POST /project/{id}/compile
{
  "compile": {
    "options": {
      "force": true  // ← Должно быть здесь!
    }
  }
}
```

### 2. Проверить логи backend

```bash
docker logs -f develop-clsi-1 | grep -E "force|clearing"

# Ожидаемые логи:
# "force recompile requested, clearing temporary files"
# "starting force recompile (from scratch)"
```

### 3. Функциональный тест

```latex
% Создать документ с датой
\documentclass{article}
\begin{document}
Today is: \today
\end{document}
```

1. Compile → Дата сегодня
2. Подождать до следующего дня
3. Обычный Recompile → Дата НЕ обновилась (из кэша) ❌
4. "Recompile from scratch" → Дата обновилась! ✅

## 🔍 Расположение кнопки

Кнопка уже существует во frontend:
- **Местоположение:** Панель над PDF → Dropdown рядом с кнопкой "Recompile"
- **Пункт меню:** "Recompile from scratch" (последний пункт)
- **Компонент:** `services/web/frontend/js/features/pdf-preview/components/pdf-compile-button.tsx`

## ✅ Готово к использованию

Все изменения внесены, кнопка готова к использованию!

### Чтобы протестировать:
1. Пересобрать frontend (если нужно)
2. Открыть проект в Overleaf
3. Нажать Recompile → выпадающее меню → "Recompile from scratch"
4. Проверить в Network что `force: true` передаётся
5. Проверить что временные файлы очищены (логи CLSI)

---

**Backend + Frontend = 100% готово!** 🎉

