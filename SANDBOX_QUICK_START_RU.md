# 🚀 Быстрый старт: Защищённая компиляция

## ✅ Что уже настроено

Ваша установка Overleaf **уже защищена**! В `develop/docker-compose.yml` включен режим sandboxed компиляции:

```yaml
clsi:
  environment:
    - SANDBOXED_COMPILES=true
    - SANDBOXED_COMPILES_HOST_DIR_COMPILES=${PWD}/compiles
    - SANDBOXED_COMPILES_HOST_DIR_OUTPUT=${PWD}/output
```

## 🔒 Новые улучшения безопасности

Мы добавили следующие улучшения в `services/clsi/app/js/DockerRunner.js`:

1. ✅ **Read-only файловая система** контейнера (всегда включена по умолчанию)
2. ✅ **Ограничения TeX Live**: `openout_any=r`, `shell_escape=f`
3. ✅ **Безопасные tmpfs** с флагами `noexec,nosuid,nodev`
4. ✅ **Увеличенные лимиты** для tmpfs (1GB для /tmp, 64MB для /home/tex)

## 🏃 Запуск

```bash
# Просто запустите dev режим как обычно
cd /Users/gleb/Projects/overleaf
./develop/bin/dev
```

## 🧪 Тестирование безопасности

### 1. Создайте тестовый проект в Overleaf

Откройте браузер: http://localhost

### 2. Создайте документ с проверками безопасности

Используйте файл `SECURITY_TEST_DOCUMENT.tex` из корня проекта (см. ниже).

### 3. Попробуйте скомпилировать

- Обычные LaTeX команды должны работать нормально ✅
- Попытки записи в системные директории должны быть заблокированы ❌
- Попытки выполнения команд через `\write18` должны быть заблокированы ❌

## 📊 Проверка логов

```bash
# Смотрите логи CLSI для деталей компиляции
docker compose -f develop/docker-compose.yml logs -f clsi

# Проверьте активные контейнеры компиляции
docker ps --filter "name=project-"

# Проверьте настройки безопасности контейнера
docker inspect $(docker ps -q --filter "name=project-" | head -1) | jq '.[0].HostConfig.ReadonlyRootfs'
# Должно вывести: true
```

## 🔍 Что проверить

### ✅ Компиляция работает
```bash
# В логах CLSI вы должны увидеть:
# "docker container has exited {"exitCode":0}"
```

### ✅ Read-only режим включен
```bash
docker inspect <container_id> | jq '.[0].HostConfig.ReadonlyRootfs'
# Должно быть: true
```

### ✅ Tmpfs настроены правильно
```bash
docker inspect <container_id> | jq '.[0].HostConfig.Tmpfs'
# Должно показать /tmp и /home/tex с флагами noexec,nosuid,nodev
```

### ✅ Сеть отключена
```bash
docker inspect <container_id> | jq '.[0].HostConfig.NetworkMode'
# Должно быть: "none" или пустое (отключено через NetworkDisabled)
```

## ⚠️ Известные ограничения

### Пакеты, требующие shell-escape
Некоторые пакеты (например, `minted` для подсветки кода) не будут работать, так как требуют shell-escape.

**Решение**: Если вам нужны такие пакеты, используйте альтернативы:
- Для подсветки кода: `listings` вместо `minted`
- Для диаграмм: используйте TikZ напрямую вместо внешних инструментов

**Или**: Разрешите restricted shell-escape (см. полную документацию в `SECURITY_SANDBOXED_COMPILATION_RU.md`)

## 📚 Дополнительная информация

Полная документация: `SECURITY_SANDBOXED_COMPILATION_RU.md`

## 🎉 Готово!

Теперь все компиляции LaTeX выполняются в защищённой песочнице. Вы можете безопасно работать с любыми LaTeX документами, не беспокоясь о безопасности системы!

