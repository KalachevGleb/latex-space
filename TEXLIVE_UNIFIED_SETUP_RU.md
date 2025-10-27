# Быстрая инструкция: Единая установка TeX Live

## Что изменилось

Начиная с этой версии, Overleaf CE использует **единый образ TeX Live** для всех компиляций:

- ❌ **Раньше**: TeX Live устанавливался дважды - в sharelatex и в отдельном образе
- ✅ **Теперь**: Единый образ `texlive-full` с полной версией TeX Live

## Краткая инструкция для новых пользователей

### 1. Соберите образ texlive-full

```bash
cd /path/to/overleaf
docker build develop/texlive -t texlive-full
```

**Время сборки**: 1-2 часа (скачивается ~5-6 ГБ пакетов)

### 2. Настройте docker-compose.yml

Убедитесь, что следующие строки раскомментированы и настроены:

```yaml
services:
    sharelatex:
        volumes:
            - /var/run/docker.sock:/var/run/docker.sock  # ВАЖНО!
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

**Замените `/home/user/sharelatex_data`** на реальный путь к вашим данным!

### 3. Создайте необходимые директории

```bash
mkdir -p ~/sharelatex_data/data/compiles
mkdir -p ~/sharelatex_data/data/output
chmod 755 ~/sharelatex_data/data/compiles
chmod 755 ~/sharelatex_data/data/output
```

### 4. Запустите Overleaf

```bash
docker compose up -d
```

### 5. Проверьте работу

Откройте http://localhost и создайте тестовый проект. Компиляция должна работать с полным набором пакетов TeX Live.

## Для существующих пользователей (обновление)

Если вы обновляете установку:

```bash
# 1. Остановите контейнеры
docker compose down

# 2. Соберите новый образ texlive-full
docker build develop/texlive -t texlive-full

# 3. (Опционально) Пересоберите sharelatex для экономии места
docker compose build sharelatex

# 4. Обновите docker-compose.yml (см. выше)

# 5. Запустите
docker compose up -d
```

## Преимущества

✅ **Полный TeX Live** - все пакеты доступны сразу
✅ **Кириллица из коробки** - русский язык работает без настройки
✅ **Безопасность** - изолированная компиляция в отдельных контейнерах
✅ **Экономия места** - TeX Live установлен один раз
✅ **Кеширование** - быстрые повторные компиляции

## Устранение проблем

### "texlive-full image not found"

```bash
# Проверьте наличие образа
docker images | grep texlive-full

# Если нет - соберите
docker build develop/texlive -t texlive-full
```

### Медленная компиляция

Первая компиляция всегда медленная (инициализация кешей). Последующие будут быстрее.

Для ускорения добавьте в `docker-compose.yml`:

```yaml
SANDBOXED_COMPILES_HOST_DIR_TEXLIVE_CACHE: '/home/user/sharelatex_data/texlive-cache'
```

И создайте директорию:

```bash
mkdir -p ~/sharelatex_data/texlive-cache
chmod 777 ~/sharelatex_data/texlive-cache
```

### Проблемы с правами

```bash
chmod 777 ~/sharelatex_data/data/compiles
chmod 777 ~/sharelatex_data/data/output
chmod 777 ~/sharelatex_data/texlive-cache  # если используете
```

## Дополнительная информация

Детальное описание изменений и технических деталей:
📖 [TEXLIVE_SINGLE_INSTANCE_RU.md](./TEXLIVE_SINGLE_INSTANCE_RU.md)

Информация о системе компиляций:
📖 [COMPILATION_QUEUE_FINAL_SUMMARY_RU.md](./COMPILATION_QUEUE_FINAL_SUMMARY_RU.md)

Вопросы безопасности:
📖 [SECURITY_SANDBOXED_COMPILATION_RU.md](./SECURITY_SANDBOXED_COMPILATION_RU.md)
