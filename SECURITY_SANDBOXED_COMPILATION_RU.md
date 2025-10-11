# Защищённая компиляция в Sandbox (Песочнице)

## 🔒 Обзор безопасности

В этой кастомной версии Overleaf Community Edition реализована многоуровневая защита для компиляции LaTeX документов.

## 🛡️ Реализованные меры безопасности

### 1. **Изоляция на уровне Docker контейнеров**
- Каждая компиляция запускается в отдельном Docker контейнере
- Контейнеры изолированы от хостовой системы и друг от друга
- Автоматическое удаление контейнеров после использования

### 2. **Read-Only файловая система контейнера**
```javascript
ReadonlyRootfs: true
```
- Вся файловая система контейнера монтируется в режиме только для чтения
- LaTeX **НЕ может** модифицировать системные файлы
- LaTeX **НЕ может** устанавливать вредоносный код в систему
- Исключения: `/tmp` и `/home/tex` (tmpfs для временных файлов)

### 3. **Ограничение доступа к файловой системе**

#### Что доступно для чтения:
- ✅ Файлы текущего проекта в `/compile`
- ✅ Пакеты LaTeX из TeX Live дистрибутива
- ✅ Стандартные системные библиотеки (read-only)

#### Что доступно для записи:
- ✅ `/compile` - рабочая директория проекта (для .pdf, .aux, .log и т.д.)
- ✅ `/tmp` - временные файлы (tmpfs, noexec)
- ✅ `/home/tex` - домашняя директория пользователя tex (tmpfs, noexec)

#### Что НЕ доступно:
- ❌ Доступ к другим проектам
- ❌ Доступ к системным директориям для записи
- ❌ Доступ к директориям за пределами проекта
- ❌ Выполнение файлов из tmpfs (noexec флаг)

### 4. **Ограничения на уровне TeX Live**

#### openout_any = 'r' (restricted)
- LaTeX может создавать файлы **только** в:
  - Текущей директории проекта
  - Стандартных директориях TeX Live (read-only)
- Запрещено создание файлов вне рабочей директории

#### openin_any = 'a' (any)
- LaTeX может читать файлы из любых доступных директорий
- Необходимо для загрузки пакетов из TeX Live

#### shell_escape = 'f' (forbidden)
- **Полностью запрещено** выполнение внешних команд из LaTeX
- Защита от `\write18` атак
- Исключение: для некоторых специальных операций (synctex)

### 5. **Сетевая изоляция**
```javascript
NetworkDisabled: true
```
- Контейнеры **полностью** изолированы от сети
- Невозможно скачать или отправить данные
- Защита от утечки данных и загрузки вредоносного кода

### 6. **Ограничение системных вызовов (Seccomp)**
- Используется Seccomp профиль для ограничения системных вызовов
- Блокируются опасные syscalls
- Whitelist-подход: разрешены только необходимые вызовы

### 7. **Удаление всех capabilities**
```javascript
CapDrop: 'ALL'
```
- У процесса нет никаких Linux capabilities
- Невозможно выполнить привилегированные операции

### 8. **Безопасность процессов**
```javascript
SecurityOpt: ['no-new-privileges']
```
- Процесс не может получить дополнительные привилегии
- Защита от privilege escalation атак

### 9. **tmpfs с флагами безопасности**
```javascript
tmpfs: {
  '/tmp': 'rw,noexec,nosuid,nodev,size=1048576k',
  '/home/tex': 'rw,noexec,nosuid,nodev,size=65536k'
}
```
- **noexec** - нельзя выполнять файлы из tmpfs
- **nosuid** - setuid/setgid биты игнорируются
- **nodev** - нельзя создавать device файлы
- Ограниченный размер для защиты от DoS

### 10. **Ограничения ресурсов**
- **Memory**: 1GB максимум на контейнер
- **CPU time**: timeout + 10 секунд
- **Disk I/O**: Ограничено через tmpfs размеры

## 📋 Что это даёт на практике

### ✅ Защита от:
1. **Модификации системных файлов** - вся FS read-only
2. **Доступа к другим проектам** - изоляция на уровне volumes
3. **Выполнения произвольных команд** - shell_escape=forbidden
4. **Сетевых атак** - сеть отключена
5. **Утечки данных** - нет сети, изолированная FS
6. **Установки вредоносного ПО** - read-only FS
7. **Privilege escalation** - нет capabilities, no-new-privileges
8. **Fork bombs и DoS** - ограничения ресурсов
9. **Опасных системных вызовов** - Seccomp whitelist

### ⚠️ Ограничения (по сравнению с полным доступом):
- Нельзя использовать `\write18` для выполнения внешних команд
- Нельзя создавать файлы вне рабочей директории проекта
- Нет доступа к сети (нельзя загружать данные извне)

## 🚀 Использование

### Проверка статуса

Убедитесь, что в вашем `develop/docker-compose.yml` включен sandboxed режим:

```yaml
clsi:
  environment:
    - SANDBOXED_COMPILES=true
    - SANDBOXED_COMPILES_HOST_DIR_COMPILES=${PWD}/compiles
    - SANDBOXED_COMPILES_HOST_DIR_OUTPUT=${PWD}/output
```

### Запуск

```bash
# Из корня проекта
./develop/bin/dev
```

### Логи компиляции

```bash
# Просмотр логов CLSI сервиса
docker compose -f develop/docker-compose.yml logs -f clsi
```

## 🔧 Настройка

### Отключение read-only режима (НЕ рекомендуется)

Если по какой-то причине вам нужно отключить read-only файловую систему, добавьте в `develop/dev.env`:

```bash
# В develop/docker-compose.yml в секции clsi environment:
- DOCKER_READONLY=false
```

Затем в `services/clsi/config/settings.defaults.js` измените проверку:
```javascript
const enableReadonlyRootfs = 
  process.env.DOCKER_READONLY !== 'false' && Settings.clsi.docker.Readonly !== false
```

### Изменение лимитов ресурсов

В `services/clsi/app/js/DockerRunner.js`:

```javascript
Memory: 1024 * 1024 * 1024 * 2, // 2GB вместо 1GB
```

### Разрешение shell-escape для специфических пакетов

Некоторые LaTeX пакеты требуют shell-escape (например, minted для подсветки кода).

**Вариант 1**: Разрешить restricted shell-escape (безопаснее):

В `services/clsi/app/js/LatexRunner.js` добавьте флаг:
```javascript
command.push('-shell-escape') // или -shell-restricted
```

**Вариант 2**: Настроить через переменную окружения (в develop/dev.env):
```bash
TEXLIVE_SHELL_ESCAPE=p  # p = restricted, t = true (небезопасно)
```

## 📊 Мониторинг

### Просмотр активных контейнеров

```bash
docker ps --filter "name=project-"
```

### Проверка security настроек контейнера

```bash
docker inspect <container_id> | jq '.[0].HostConfig.SecurityOpt'
docker inspect <container_id> | jq '.[0].HostConfig.ReadonlyRootfs'
```

### Лог компиляции с деталями

При компиляции в логах CLSI вы увидите:
```
docker container has exited {"exitCode":0, "options": {...}}
```

## 🐛 Устранение неполадок

### Проблема: "Permission denied" при компиляции

**Причина**: Read-only файловая система блокирует запись.

**Решение**: Проверьте, что tmpfs правильно настроены:
```bash
docker exec -it <clsi_container> df -h
```

### Проблема: Пакет требует shell-escape

**Причина**: shell_escape=forbidden блокирует выполнение команд.

**Решение**: См. раздел "Разрешение shell-escape" выше.

### Проблема: Недостаточно памяти/места

**Причина**: Ограничения ресурсов слишком жёсткие.

**Решение**: Увеличьте лимиты в DockerRunner.js (см. раздел "Настройка").

## 📚 Дополнительная информация

### Архитектура безопасности

```
┌─────────────────────────────────────────────────┐
│           Host System (macOS)                   │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │     CLSI Service (Docker Container)       │  │
│  │                                           │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │  LaTeX Compilation Container        │  │  │
│  │  │                                     │  │  │
│  │  │  • ReadonlyRootfs: true             │  │  │
│  │  │  • NetworkDisabled: true            │  │  │
│  │  │  • CapDrop: ALL                     │  │  │
│  │  │  • Seccomp profile                  │  │  │
│  │  │  • no-new-privileges                │  │  │
│  │  │                                     │  │  │
│  │  │  Volumes:                           │  │  │
│  │  │  • /compile (rw) ← project files    │  │  │
│  │  │  • /tmp (tmpfs, noexec)             │  │  │
│  │  │  • /home/tex (tmpfs, noexec)        │  │  │
│  │  │                                     │  │  │
│  │  │  Environment:                       │  │  │
│  │  │  • openout_any=r                    │  │  │
│  │  │  • openin_any=a                     │  │  │
│  │  │  • shell_escape=f                   │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Файлы, затронутые изменениями

1. **services/clsi/app/js/DockerRunner.js** - основная логика безопасности
2. **services/clsi/seccomp/clsi-profile.json** - профиль Seccomp
3. **services/clsi/config/settings.defaults.js** - настройки (без изменений)
4. **develop/docker-compose.yml** - конфигурация dev окружения (уже настроено)

### Тестирование безопасности

Создайте тестовый LaTeX документ для проверки:

```latex
\documentclass{article}
\begin{document}

% Попытка записи в недоступную директорию
% Должно завершиться с ошибкой
\immediate\openout\tempfile=/etc/test.txt

% Попытка выполнения команды
% Должно завершиться с ошибкой (если shell_escape=f)
\immediate\write18{ls -la}

Hello, World!

\end{document}
```

## ✅ Итог

Теперь ваша установка Overleaf имеет:

✅ **Полную изоляцию** на уровне Docker контейнеров  
✅ **Read-only файловую систему** (кроме рабочей директории и tmpfs)  
✅ **Ограничение доступа** только к текущему проекту и пакетам LaTeX  
✅ **Запрет на выполнение команд** через LaTeX  
✅ **Сетевую изоляцию**  
✅ **Ограничение системных вызовов** через Seccomp  
✅ **Защиту от privilege escalation**  
✅ **Ограничения ресурсов**  

Это обеспечивает высокий уровень безопасности для локальной разработки! 🚀

