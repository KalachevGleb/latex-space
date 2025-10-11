# 🧪 Быстрый тест системы очереди компиляций

## Подготовка

1. Убедитесь, что dev environment запущен:
```bash
cd /Users/gleb/Projects/overleaf
./develop/bin/dev
```

2. Откройте browser на `http://localhost`

## Тест 1: Базовая компиляция ✅

### Ожидаемое поведение:
- Компиляция запускается
- Результат отображается
- В логах CLSI видно: "compilation started"

### Шаги:
1. Откройте любой проект
2. Нажмите "Recompile"
3. Дождитесь завершения

### Проверка логов:
```bash
# В отдельном терминале
docker logs -f overleaf-clsi-1 2>&1 | grep -i "compilation"
```

Ожидаемые логи:
```
requesting compilation projectId=... userId=...
starting new compilation projectId=... configHash=...
compilation started projectId=...
compilation completed projectId=...
```

## Тест 2: Кэширование результатов ✅

### Ожидаемое поведение:
- Первая компиляция: запуск процесса
- Вторая компиляция: мгновенный результат из кэша

### Шаги:
1. Нажмите "Recompile" (первый раз)
2. Дождитесь завершения (может быть медленно)
3. Нажмите "Recompile" снова (второй раз)
4. Результат должен появиться мгновенно!

### Проверка логов:
```bash
docker logs overleaf-clsi-1 2>&1 | grep -i "cache"
```

Ожидаемые логи:
```
compilation-cache-hit projectId=... configHash=...
returning cached compilation result projectId=...
```

### Метрики:
```bash
# Проверить метрики
curl -s http://localhost:3013/metrics | grep compilation_cache_hit
```

## Тест 3: Два пользователя, одна компиляция 👥

### Ожидаемое поведение:
- Обе вкладки получают один и тот же результат
- Только один процесс компиляции запускается

### Шаги:
1. Откройте проект в двух вкладках/окнах браузера
2. **Одновременно** нажмите "Recompile" в обеих вкладках
3. Обе вкладки должны получить результат

### Проверка логов:
```bash
docker logs overleaf-clsi-1 2>&1 | grep -A5 "joining existing"
```

Ожидаемые логи:
```
joining existing compilation projectId=... userId=...
compilation-joined
```

### Метрики:
```bash
curl -s http://localhost:3013/metrics | grep compilation_joined
```

## Тест 4: Изменение кода во время компиляции 📝

### Ожидаемое поведение:
- Старая компиляция отменяется
- Новая компиляция начинается
- Кэш очищается

### Шаги:
1. Создайте большой проект (чтобы компиляция была долгой)
2. Нажмите "Recompile"
3. **Пока компилируется**, измените любой .tex файл
4. Нажмите "Recompile" снова
5. Старая компиляция должна быть отменена

### Проверка логов:
```bash
docker logs overleaf-clsi-1 2>&1 | grep -i "project.*changed\|cancel"
```

Ожидаемые логи:
```
handling project version change projectId=...
cancelling compilation projectId=... reason=project-changed
```

### Метрики:
```bash
curl -s http://localhost:3013/metrics | grep project_version_changed
curl -s http://localhost:3013/metrics | grep compilation_cancelled
```

## Тест 5: WebSocket уведомления 📡

### Ожидаемое поведение:
- CLSI отправляет уведомление в Real-Time service
- Real-Time service рассылает через WebSocket

### Проверка Real-Time логов:
```bash
docker logs -f overleaf-real-time-1 2>&1 | grep -i "compilation"
```

Ожидаемые логи (после компиляции):
```
received compilation update from CLSI projectId=... type=compilation-complete
```

### Проверка в Browser Console:
```javascript
// Откройте DevTools Console
window.socket.on('compilationUpdate', (data) => {
  console.log('📡 Compilation update received:', data)
})

// Теперь нажмите Recompile
```

Ожидаемый вывод:
```javascript
📡 Compilation update received: {
  type: 'compilation-complete',
  userId: '...',
  configHash: '...',
  status: 'success',
  outputFiles: [...]
}
```

## Тест 6: Отключение пользователя 🔌

### Ожидаемое поведение:
- При закрытии вкладки пользователь удаляется из waitingUsers
- Если никто не ждёт, компиляция отменяется

### Шаги:
1. Запустите долгую компиляцию
2. Закройте вкладку браузера
3. Компиляция должна быть отменена

### Проверка логов:
```bash
docker logs overleaf-clsi-1 2>&1 | grep -i "user disconnected\|no-waiting-users"
```

Ожидаемые логи:
```
user disconnected, cleaning up userId=...
cancelling compilation projectId=... reason=no-waiting-users
```

## 🎯 Проверка метрик (общие)

```bash
# Все метрики компиляций
curl -s http://localhost:3013/metrics | grep compilation

# Должны увидеть:
# compilation_cache_hit
# compilation_joined
# compilation_started
# compilation_completed
# active_compilations
# compilation_states_count
```

## 🐛 Отладка проблем

### Проблема: "Compilation already in progress" ошибка

**Причина:** LockManager всё ещё выбрасывает ошибку

**Решение:** Проверьте, что интеграция включена в `CompileManager.js`:
```bash
grep -A5 "CompilationQueueManager.requestCompilation" services/clsi/app/js/CompileManager.js
```

### Проблема: WebSocket уведомления не приходят

**Причина:** Real-Time service не получает уведомления

**Проверка:**
```bash
# 1. Проверить, что endpoint существует
curl -X POST http://localhost:3026/project/test123/compilation-update \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","type":"compilation-complete"}'

# Должен вернуть 200 OK

# 2. Проверить настройки CLSI
grep -i "realTime" services/clsi/config/settings.defaults.js
```

### Проблема: Кэш не работает

**Причина:** configHash не совпадает

**Проверка логов:**
```bash
docker logs overleaf-clsi-1 2>&1 | grep configHash
```

Убедитесь, что configHash одинаковый для одинаковых настроек.

### Проблема: Память растёт

**Причина:** Cleanup не работает

**Проверка:**
```bash
# Проверить количество состояний
curl -s http://localhost:3013/metrics | grep compilation_states_count
```

Cleanup запускается каждую минуту и удаляет состояния старше 1 часа.

## ✅ Чеклист успешного теста

- [ ] Базовая компиляция работает
- [ ] Кэширование работает (второй запрос мгновенный)
- [ ] Два пользователя получают один результат
- [ ] Изменения кода сбрасывают кэш
- [ ] WebSocket уведомления приходят
- [ ] Отключение пользователя обрабатывается
- [ ] Метрики собираются
- [ ] Нет ошибок в логах

## 📊 Ожидаемые улучшения

### Скорость:
- **До:** Каждая компиляция = новый процесс
- **После:** Кэш = мгновенный результат

### Надёжность:
- **До:** "Compilation already in progress" при перезагрузке
- **После:** Подключение к существующей компиляции

### Эффективность:
- **До:** N пользователей = N процессов
- **После:** N пользователей = 1 процесс (если одинаковая конфигурация)

## 🎉 Готово!

Если все тесты прошли успешно - система работает!

Следующие шаги:
1. Нагрузочное тестирование
2. Интеграция UI для отображения статуса очереди
3. Redis persistence (опционально)
4. Production deployment

