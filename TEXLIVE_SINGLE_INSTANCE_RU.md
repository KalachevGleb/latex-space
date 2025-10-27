# Устранение дублирования TeX Live

## Проблема

Ранее в Overleaf CE происходило дублирование установки TeX Live:
1. **В контейнере sharelatex** устанавливалась минимальная версия TeX Live (`scheme-basic`)
2. **Для изолированной компиляции** (sandboxed compiles) использовался отдельный Docker-образ с полной версией TeX Live

Это приводило к:
- Увеличению размера образов
- Неэффективному использованию дискового пространства
- Путанице в конфигурации

## Решение

### 1. Удаление TeX Live из базового образа sharelatex

TeX Live больше не устанавливается в базовый образ `sharelatex/sharelatex-base` (файл `server-ce/Dockerfile-base`).

**Обоснование**: При использовании sandboxed compiles (рекомендуемая конфигурация для безопасности) компиляция происходит в изолированных контейнерах на основе образа `texlive-full`, поэтому установка TeX Live в sharelatex не требуется.

### 2. Использование единого образа texlive-full

Все компиляции теперь используют единый образ `texlive-full`, который содержит:
- Полный дистрибутив TeX Live со всеми пакетами
- Поддержку кириллицы (`texlive-lang-cyrillic`)
- Дополнительные инструменты: `fontconfig`, `inkscape`, `pandoc`, `python3-pygments`

### 3. Конфигурация по умолчанию

В файле `docker-compose.yml` теперь по умолчанию указаны переменные окружения для использования `texlive-full`:

```yaml
TEXLIVE_IMAGE: 'texlive-full'
TEX_LIVE_DOCKER_IMAGE: 'texlive-full'
ALL_TEX_LIVE_DOCKER_IMAGES: 'texlive-full'
```

Также обновлены настройки CLSI (`services/clsi/config/settings.defaults.js`), где по умолчанию используется образ `texlive-full` вместо устаревшего `quay.io/sharelatex/texlive-full:2017.1`.

## Инструкция по установке

### Шаг 1: Сборка образа texlive-full

Перед первым запуском Overleaf необходимо собрать образ texlive-full:

```bash
cd /путь/к/overleaf
docker build develop/texlive -t texlive-full
```

**Внимание**: Сборка может занять 1-2 часа в зависимости от скорости интернет-соединения и производительности системы.

### Шаг 2: Настройка docker-compose.yml

Убедитесь, что в вашем `docker-compose.yml` раскомментированы и правильно настроены следующие переменные:

```yaml
services:
    sharelatex:
        volumes:
            # ВАЖНО: Необходимо монтировать Docker socket для sandboxed compiles
            - /var/run/docker.sock:/var/run/docker.sock
        environment:
            SANDBOXED_COMPILES: 'true'
            SANDBOXED_COMPILES_HOST_DIR_COMPILES: '/home/user/sharelatex_data/data/compiles'
            SANDBOXED_COMPILES_HOST_DIR_OUTPUT: '/home/user/sharelatex_data/data/output'
            DOCKER_RUNNER: 'true'
            SANDBOXED_COMPILES_SIBLING_CONTAINERS: 'true'
            TEXLIVE_IMAGE: 'texlive-full'
            TEX_LIVE_DOCKER_IMAGE: 'texlive-full'
            ALL_TEX_LIVE_DOCKER_IMAGES: 'texlive-full'
```

**Важно**: Замените `/home/user/sharelatex_data` на реальный путь к вашим данным.

### Шаг 3: Запуск Overleaf

```bash
docker compose up -d
```

## Преимущества

1. **Устранение дублирования**: TeX Live установлен только один раз в образе `texlive-full`
2. **Полная версия по умолчанию**: Все пользователи получают доступ к полному набору пакетов TeX Live
3. **Упрощение конфигурации**: Единая точка управления версией TeX Live
4. **Безопасность**: Изолированная компиляция в отдельных контейнерах
5. **Поддержка кириллицы**: Встроенная поддержка русского и других кириллических языков

## Миграция с предыдущих версий

Если вы обновляете существующую установку Overleaf:

1. Остановите все контейнеры:
   ```bash
   docker compose down
   ```

2. Соберите новый образ texlive-full:
   ```bash
   docker build develop/texlive -t texlive-full
   ```

3. Пересоберите образ sharelatex (необязательно, но рекомендуется для получения обновленной версии без TeX Live):
   ```bash
   docker compose build sharelatex
   ```

4. Обновите `docker-compose.yml` согласно инструкциям выше

5. Запустите Overleaf:
   ```bash
   docker compose up -d
   ```

## Настройка для development-окружения

Для разработки используется другой файл `develop/docker-compose.yml`, который уже настроен на использование `texlive-full`. Убедитесь, что образ собран:

```bash
cd develop
docker build texlive -t texlive-full
bin/up  # или bin/dev для режима разработки
```

## Альтернативные образы TeX Live

Если вам нужны разные версии TeX Live (например, для тестирования совместимости), вы можете:

1. Собрать образы с разными тегами:
   ```bash
   docker build develop/texlive -t texlive-full:2024
   docker build develop/texlive -t texlive-full:2025
   ```

2. Указать список доступных образов в `ALL_TEX_LIVE_DOCKER_IMAGES`:
   ```yaml
   ALL_TEX_LIVE_DOCKER_IMAGES: 'texlive-full:2024,texlive-full:2025'
   TEX_LIVE_DOCKER_IMAGE: 'texlive-full:2025'  # По умолчанию
   ```

3. Пользователи смогут выбирать версию в настройках проекта (если эта функция включена)

## Устранение проблем

### Ошибка "texlive-full image not found"

Если при компиляции возникает ошибка о том, что образ `texlive-full` не найден:

1. Проверьте, что образ собран:
   ```bash
   docker images | grep texlive-full
   ```

2. Если образа нет, соберите его:
   ```bash
   docker build develop/texlive -t texlive-full
   ```

### Медленная первая компиляция

Первая компиляция может быть медленной из-за:
- Загрузки и кеширования шрифтов
- Инициализации TeX Live кеша

Последующие компиляции будут значительно быстрее благодаря:
- Кешированию в `/home/tex/.texlive{year}/`
- Монтированию `SANDBOXED_COMPILES_HOST_DIR_TEXLIVE_CACHE`
- Умной системе кеширования компиляций (см. `COMPILATION_QUEUE_FINAL_SUMMARY_RU.md`)

### Проблемы с правами доступа

Если возникают проблемы с правами доступа к директориям компиляции:

1. Убедитесь, что директории существуют и доступны:
   ```bash
   mkdir -p ~/sharelatex_data/data/compiles
   mkdir -p ~/sharelatex_data/data/output
   chmod 777 ~/sharelatex_data/data/compiles
   chmod 777 ~/sharelatex_data/data/output
   ```

2. Проверьте, что пути в `docker-compose.yml` указывают на правильные директории

## Дополнительные ресурсы

- [SECURITY_SANDBOXED_COMPILATION_RU.md](./SECURITY_SANDBOXED_COMPILATION_RU.md) - Детальная информация о безопасности изолированной компиляции
- [TEXLIVE_CACHE_SPEEDUP.md](./TEXLIVE_CACHE_SPEEDUP.md) - Оптимизация скорости компиляции через кеширование
- [FIX_HOME_ENV_FOR_TEXLIVE_CACHE.md](./FIX_HOME_ENV_FOR_TEXLIVE_CACHE.md) - Настройка кеша TeX Live
- [COMPILATION_QUEUE_FINAL_SUMMARY_RU.md](./COMPILATION_QUEUE_FINAL_SUMMARY_RU.md) - Умная система управления очередью компиляций с кешированием

## Техническая информация

### Dockerfile образа texlive-full

Образ `texlive-full` создается из `develop/texlive/Dockerfile`:

```dockerfile
FROM debian:testing-slim

RUN apt-get update
RUN apt-cache depends texlive-full | grep "Depends: " | grep -v -- "-doc" | grep -v -- "-lang-" | sed 's/Depends: //' | xargs apt-get install -y --no-install-recommends
RUN apt-get install -y --no-install-recommends texlive-lang-cyrillic
RUN apt-get install -y --no-install-recommends fontconfig inkscape pandoc python3-pygments

RUN useradd tex
USER tex
```

Этот Dockerfile:
1. Использует Debian testing-slim в качестве базового образа
2. Устанавливает все пакеты из `texlive-full` (кроме документации и большинства языковых пакетов)
3. Добавляет поддержку кириллицы
4. Устанавливает дополнительные инструменты для работы с документами
5. Создает пользователя `tex` для изоляции

### Конфигурация CLSI

В `services/clsi/config/settings.defaults.js` настроены параметры для работы с Docker:

```javascript
docker: {
  image: process.env.TEXLIVE_IMAGE ||
         process.env.TEX_LIVE_DOCKER_IMAGE ||
         'texlive-full',
  user: process.env.TEXLIVE_IMAGE_USER || 'tex',
  env: {
    HOME: '/home/tex',  // Важно для кеширования
    CLSI: 1,
  },
  // ... другие настройки
}
```

### Переменные окружения

Список всех переменных окружения, связанных с TeX Live:

| Переменная | Описание | Значение по умолчанию |
|-----------|----------|---------------------|
| `TEXLIVE_IMAGE` | Основное имя образа TeX Live | `texlive-full` |
| `TEX_LIVE_DOCKER_IMAGE` | Альтернативное имя (совместимость) | `texlive-full` |
| `ALL_TEX_LIVE_DOCKER_IMAGES` | Список доступных образов (через запятую) | `texlive-full` |
| `TEXLIVE_IMAGE_USER` | Пользователь для запуска компиляции | `tex` |
| `SANDBOXED_COMPILES` | Включение изолированной компиляции | `true` |
| `SANDBOXED_COMPILES_HOST_DIR_COMPILES` | Путь к директории компиляции на хосте | - |
| `SANDBOXED_COMPILES_HOST_DIR_OUTPUT` | Путь к директории вывода на хосте | - |
| `SANDBOXED_COMPILES_HOST_DIR_TEXLIVE_CACHE` | Путь к кешу TeX Live на хосте (опционально) | - |

## Заключение

Теперь Overleaf CE использует единый образ `texlive-full` для всех компиляций, что:
- Устраняет дублирование установки TeX Live
- Предоставляет полный набор пакетов всем пользователям по умолчанию
- Упрощает конфигурацию и поддержку
- Обеспечивает лучшую безопасность через изолированные контейнеры

При первичной установке система автоматически будет использовать `texlive-full` после его сборки.
