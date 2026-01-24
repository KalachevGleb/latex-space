# Развертывание Overleaf Custom Edition

## Быстрый старт

### 1. Подготовка пакета для установки (на машине разработки)

```bash
cd /path/to/overleaf
chmod +x scripts/prepare_install.sh
./scripts/prepare_install.sh
```

Результат: файл `overleaf-custom.tar.gz` (~5-8 GB)

### 2. Установка на целевом сервере

Скопируйте файлы на сервер:
```bash
scp overleaf-custom.tar.gz scripts/*.sh overleaf_config.json user@server:/tmp/
```

Проверьте системные требования (опционально):
```bash
ssh user@server
chmod +x /tmp/check_requirements.sh
/tmp/check_requirements.sh
```

Установите:
```bash
chmod +x /tmp/install_overleaf.sh
/tmp/install_overleaf.sh /tmp/overleaf-custom.tar.gz /tmp/overleaf_config.json
```

**Примечание:** sudo требуется только если `installDir` в системной папке (например `/opt`). Для домашних директорий (`/home/user/...`) sudo не нужен.

### 3. Первый запуск

Откройте в браузере: `http://your-server/launchpad` и создайте первого администратора.

---

## Конфигурация (overleaf_config.json)

```json
{
  "siteUrl": "https://overleaf.example.com",     // URL сайта
  "appName": "My Overleaf",                       // Название приложения
  "adminEmail": "admin@example.com",              // Email администратора
  "installDir": "/home/user/overleaf",            // Путь установки (НЕ /opt!)
  "port": 80,                                     // Внешний порт (80, 443, 3000, etc)
  "dataDir": "./data",                            // Путь к данным (относительно installDir)

  "email": {                                      // Настройка почты
    "fromAddress": "noreply@example.com",
    "replyTo": "support@example.com",
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "user": "your-email@gmail.com",
      "pass": "your-app-password"
    }
  },

  "customization": {
    "navTitle": "My Company LaTeX",               // Название в навигации
    "headerImageUrl": "https://example.com/logo.png"  // Логотип (опционально)
  }
}
```

**Важно:**
- `installDir` - директория установки приложения (по умолчанию `/opt/overleaf`)
- `port` - внешний порт, на котором будет доступен Overleaf (контейнер слушает 80, пробрасывается на указанный)
- `dataDir` - путь к данным относительно `installDir` (или абсолютный путь)

---

## Управление

```bash
cd <installDir>  # Путь из config.json (по умолчанию /opt/overleaf)

# Запуск
docker compose up -d

# Остановка
docker compose down

# Просмотр логов
docker compose logs -f

# Перезапуск
docker compose restart
```

---

## Требования

- Docker 20.10+
- Docker Compose 2.0+
- 8+ GB RAM
- 50+ GB свободного места
- jq (для парсинга конфигурации)

---

## Дополнительные сценарии

### Использование с Nginx reverse proxy

Если вы хотите использовать Nginx в качестве reverse proxy для SSL/TLS:

1. В `overleaf_config.json` укажите:
```json
{
  "siteUrl": "https://overleaf.example.com",
  "port": 8080,
  "security": {
    "secureCookie": true
  }
}
```

2. Настройте Nginx:
```nginx
server {
    listen 443 ssl http2;
    server_name overleaf.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3m;
        proxy_send_timeout 3m;
    }
}
```

### Обновление установки

```bash
# Замените <installDir> на ваш путь из config.json
INSTALL_DIR="/home/user/overleaf"  # или ваш путь

# 1. Создайте резервную копию данных
tar -czf overleaf-backup-$(date +%Y%m%d).tar.gz $INSTALL_DIR/data

# 2. Остановите службы
cd $INSTALL_DIR
docker compose down

# 3. Установите новую версию
./install_overleaf.sh new-overleaf-custom.tar.gz overleaf_config.json --no-start

# 4. Запустите службы
cd $INSTALL_DIR
docker compose up -d
```

### Изменение конфигурации после установки

Отредактируйте `.env` файл и перезапустите:
```bash
cd <installDir>  # ваш путь установки
nano .env
docker compose restart
```

---

## Технические детали: Seccomp и безопасность контейнеров

### Что такое seccomp?

**Seccomp** (Secure Computing Mode) — это механизм ядра Linux, который ограничивает системные вызовы (syscalls), которые процесс может выполнять. Docker использует seccomp профили для повышения безопасности контейнеров.

### Почему мы отключаем seccomp профиль?

Overleaf использует **sibling containers** для компиляции LaTeX: основной контейнер (`sharelatex`) запускает отдельные Docker-контейнеры с TexLive для каждой компиляции. Стандартный seccomp профиль CLSI (`clsi-profile.json`) был разработан для определённой версии Docker/ядра Linux и может блокировать системные вызовы, которые нужны на других системах.

**Симптомы проблемы:**
- Контейнеры texlive создаются, но не запускаются
- Ошибка в логах: `cannot start a stopped process`
- При ручном тестировании с seccomp профилем:
  ```
  statx(STATX_MNT_ID_...) fsmount:fscontext:proc/: could not get mount id: function not implemented
  ```

**Решение:**
В этой сборке seccomp профиль заменён на минимальный, который разрешает все syscalls:
```json
{
  "defaultAction": "SCMP_ACT_ALLOW"
}
```

Файл: [services/clsi/seccomp/clsi-profile.json](services/clsi/seccomp/clsi-profile.json)

Профиль встроен в Docker-образ, поэтому никаких дополнительных действий при установке не требуется.

### Безопасность при отключённом seccomp

Отключение seccomp **не означает отсутствие защиты**. Контейнеры компиляции по-прежнему защищены:

| Механизм | Что делает | Статус |
|----------|------------|--------|
| `--cap-drop=ALL` | Удаляет все Linux capabilities | Включён |
| `--no-new-privileges` | Запрещает повышение привилегий | Включён |
| `--network=none` | Контейнер без сети | Включён |
| Bind mounts | Только необходимые директории | Включён |
| Пользователь `tex` | Некорневой пользователь (UID 1000) | Включён |
| Seccomp | Ограничение syscalls | **Отключён** |

Seccomp — это **дополнительный** слой защиты. Основные механизмы изоляции (capabilities, network isolation, non-root user) остаются активными

---

## FAQ

**Q: Нужен ли sudo для установки?**
A: Только если `installDir` в системной папке (`/opt`, `/srv`). Для домашних директорий (`/home/user/...`) sudo не требуется. Скрипт автоматически определяет, когда нужны повышенные привилегии.

**Q: Какой порт использует Overleaf?**
A: Контейнер слушает на порту 80 внутри, который пробрасывается на внешний порт из `config.json` (параметр `port`). По умолчанию 80, но можно использовать любой: 3000, 8080, etc.

**Q: Где хранятся данные?**
A: В директории `<installDir>/data/` (или в пути из `dataDir` в конфиге). Там MongoDB, Redis и файлы проектов.

**Q: Как сделать backup?**
A: `tar -czf backup.tar.gz <installDir>/data/`

**Q: Нужно ли пересобирать образы при изменении кода?**
A: Да. Запустите `./scripts/prepare_install.sh` заново для создания нового пакета с обновлениями.

**Q: Как протестировать развертывание локально перед использованием на сервере?**
A: См. [TESTING.md](TESTING.md) - там описаны 5 сценариев тестирования, включая имитацию удаленного сервера, тестирование в локальной сети, использование VM и т.д.
