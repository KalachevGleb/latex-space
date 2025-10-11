# ✅ Исправлена поддержка русского языка в LaTeX

## 🐛 Проблема

При компиляции LaTeX документов с русским языком возникала ошибка:

```
(babel) or the language definition file russian.ldf
(babel) was not found.
```

## 🔧 Решение

Добавлен пакет `texlive-lang-cyrillic` в Docker образ TexLive.

### Изменённые файлы

**Файл:** `develop/texlive/Dockerfile`

**Добавлена строка:**
```dockerfile
RUN apt-get install -y --no-install-recommends texlive-lang-cyrillic
```

Этот пакет добавляет поддержку:
- Русского языка
- Украинского языка
- Белорусского языка
- Других кириллических языков

## ✅ Как использовать

Теперь вы можете использовать русский язык в LaTeX документах:

```latex
\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage[russian]{babel}

\title{Заголовок на русском}
\author{Автор}
\date{\today}

\begin{document}

\maketitle

\section{Введение}

Это текст на русском языке. \textbf{Жирный текст}, \textit{курсив}.

\subsection{Подзаголовок}

Список:
\begin{itemize}
    \item Первый пункт
    \item Второй пункт
    \item Третий пункт
\end{itemize}

Математика: $E = mc^2$

\end{document}
```

## 📊 Что было установлено

- **Пакет:** `texlive-lang-cyrillic`
- **Размер:** ~42 MB
- **Включает:**
  - Файлы поддержки русского языка (russian.ldf)
  - Шрифты с кириллицей
  - Правила переноса для русского языка
  - Babel конфигурации для кириллических языков

## 🚀 Проверка

### 1. Убедитесь, что сервисы запущены

```bash
cd /Users/gleb/Projects/overleaf
docker compose -f develop/docker-compose.yml ps
```

Все сервисы должны быть в статусе `Up`.

### 2. Откройте Overleaf

```
http://localhost
```

### 3. Создайте тестовый документ

Используйте пример выше или ваш тестовый документ `SECURITY_TEST_DOCUMENT.tex`.

### 4. Скомпилируйте

Нажмите "Recompile" - теперь русский язык должен работать без ошибок!

## 🔍 Проверка установленного пакета

Вы можете проверить, что пакет установлен в TexLive образе:

```bash
# Проверить, что образ texlive-full существует
docker images | grep texlive-full

# Запустить временный контейнер и проверить наличие russian.ldf
docker run --rm texlive-full find /usr -name "russian.ldf"
```

Должен вернуть путь к файлу `russian.ldf`.

## 🛠️ Пересборка образа (если нужно)

Если по какой-то причине образ нужно пересобрать:

```bash
cd /Users/gleb/Projects/overleaf/develop/texlive
docker build . -t texlive-full
```

Затем перезапустите dev окружение:

```bash
cd /Users/gleb/Projects/overleaf
./develop/bin/down
./develop/bin/up
```

## 📚 Дополнительные языки

Если вам нужны другие языки, вы можете добавить соответствующие пакеты в `develop/texlive/Dockerfile`:

```dockerfile
# Европейские языки
RUN apt-get install -y --no-install-recommends texlive-lang-european

# Азиатские языки (CJK - Chinese, Japanese, Korean)
RUN apt-get install -y --no-install-recommends texlive-lang-cjk

# Арабский язык
RUN apt-get install -y --no-install-recommends texlive-lang-arabic

# Все языки (НЕ рекомендуется, очень большой размер ~500MB)
# RUN apt-get install -y --no-install-recommends texlive-lang-all
```

После изменения Dockerfile нужно пересобрать образ (см. выше).

## ✨ Итог

Проблема с русским языком исправлена! Теперь вы можете:
- ✅ Использовать `\usepackage[russian]{babel}`
- ✅ Писать тексты на русском языке
- ✅ Использовать правильные переносы
- ✅ Работать с кириллическими шрифтами

---

**Версия TexLive:** Debian testing (latest)  
**Добавленный пакет:** texlive-lang-cyrillic 2025.20250927-1  
**Дата исправления:** 2025-10-11

