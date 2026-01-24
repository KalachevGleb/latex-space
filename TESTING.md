# Тестирование развертывания Overleaf

Это руководство описывает, как протестировать систему развертывания локально, имитируя реальный production сервер.

## Сценарий 1: Тестирование на той же машине (имитация удаленного сервера)

### Подготовка

1. **Создайте тестовую директорию:**
```bash
mkdir -p ~/test-deployment
cd ~/test-deployment
```

2. **Подготовьте пакет:**
```bash
cd /path/to/overleaf
./scripts/prepare_install.sh
cp overleaf-custom.tar.gz ~/test-deployment/
cp scripts/install_overleaf.sh ~/test-deployment/
cp scripts/check_requirements.sh ~/test-deployment/
```

3. **Создайте тестовую конфигурацию:**
```bash
cat > ~/test-deployment/test_config.json << 'EOF'
{
  "siteUrl": "http://localhost:3000",
  "appName": "Overleaf Test",
  "adminEmail": "admin@test.local",
  "installDir": "/tmp/overleaf-test",
  "port": 3000,
  "dataDir": "./data",
  "email": {
    "fromAddress": "noreply@test.local"
  },
  "customization": {
    "navTitle": "Test Overleaf"
  },
  "features": {
    "emailConfirmationDisabled": true
  }
}
EOF
```

### Установка и тестирование

```bash
cd ~/test-deployment

# Проверка требований
./check_requirements.sh

# Установка (без sudo - используем /tmp)
./install_overleaf.sh overleaf-custom.tar.gz test_config.json

# Проверка, что сервисы запустились
cd /tmp/overleaf-test
docker compose ps

# Проверка логов
docker compose logs -f sharelatex
```

**Проверка доступности:**
1. Откройте http://localhost:3000
2. Должна открыться страница /launchpad
3. Создайте первого администратора
4. Создайте тестовый проект
5. Попробуйте скомпилировать документ

### Очистка после теста

```bash
cd /tmp/overleaf-test
docker compose down
cd ~
rm -rf /tmp/overleaf-test ~/test-deployment
```

---

## Сценарий 2: Тестирование доступа из локальной сети

Этот метод позволяет проверить, что Overleaf доступен с других устройств в сети.

### Подготовка

1. **Узнайте IP адрес вашего компьютера:**
```bash
# macOS
ipconfig getifaddr en0

# Linux
ip addr show | grep "inet " | grep -v 127.0.0.1

# Например: 192.168.1.100
```

2. **Создайте конфигурацию с IP адресом:**
```bash
cat > ~/test-deployment/network_config.json << EOF
{
  "siteUrl": "http://192.168.1.100:3000",
  "appName": "Overleaf Network Test",
  "adminEmail": "admin@test.local",
  "installDir": "$HOME/overleaf-network-test",
  "port": 3000,
  "dataDir": "./data",
  "features": {
    "emailConfirmationDisabled": true
  }
}
EOF
```

3. **Установите:**
```bash
cd ~/test-deployment
./install_overleaf.sh overleaf-custom.tar.gz network_config.json
```

### Тестирование

**С основного компьютера:**
```bash
curl http://192.168.1.100:3000/launchpad
# Должен вернуть HTML
```

**С телефона или другого устройства в той же сети:**
- Откройте браузер
- Перейдите на http://192.168.1.100:3000
- Должна открыться страница Overleaf

**Проверка WebSocket (для real-time редактирования):**
```bash
# Установите wscat (если нет)
npm install -g wscat

# Проверьте WebSocket соединение
wscat -c ws://192.168.1.100:3000/socket.io/?EIO=3&transport=websocket
```

### Проверка firewall (если не работает)

**macOS:**
```bash
# Проверить статус файрвола
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Временно отключить (для теста)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off

# Включить обратно после теста
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
```

**Linux (ufw):**
```bash
# Разрешить порт
sudo ufw allow 3000/tcp

# Проверить статус
sudo ufw status
```

---

## Сценарий 3: Тестирование с Docker Machine / VM (имитация реального сервера)

Этот метод максимально близок к реальному развертыванию.

### Вариант 3A: Используя Multipass (рекомендуется)

**Установка Multipass:**
```bash
# macOS
brew install multipass

# Linux
sudo snap install multipass
```

**Создание виртуальной машины:**
```bash
# Создать Ubuntu VM
multipass launch --name overleaf-test --mem 8G --disk 50G --cpus 2 22.04

# Войти в VM
multipass shell overleaf-test
```

**Установка Docker в VM:**
```bash
# Внутри VM
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
exit

# Перезайти
multipass shell overleaf-test
```

**Копирование файлов в VM:**
```bash
# На хост-машине
multipass transfer overleaf-custom.tar.gz overleaf-test:
multipass transfer scripts/install_overleaf.sh overleaf-test:
multipass transfer test_config.json overleaf-test:
```

**Установка в VM:**
```bash
# Внутри VM
chmod +x install_overleaf.sh
./install_overleaf.sh overleaf-custom.tar.gz test_config.json
```

**Получение IP VM:**
```bash
# На хост-машине
multipass info overleaf-test | grep IPv4
# Например: 192.168.64.2
```

**Тестирование:**
```bash
# На хост-машине
curl http://192.168.64.2:80/launchpad
# Открыть в браузере
open http://192.168.64.2
```

**Очистка:**
```bash
multipass delete overleaf-test
multipass purge
```

### Вариант 3B: Используя Docker в Docker (dind)

Запуск "сервера" в отдельном Docker контейнере:

```bash
# Создать контейнер-сервер
docker run -d --name overleaf-server \
  --privileged \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 3000:80 \
  ubuntu:22.04 sleep infinity

# Установить Docker внутри
docker exec overleaf-server bash -c "
  apt-get update &&
  apt-get install -y curl &&
  curl -fsSL https://get.docker.com | sh
"

# Скопировать файлы
docker cp overleaf-custom.tar.gz overleaf-server:/tmp/
docker cp scripts/install_overleaf.sh overleaf-server:/tmp/
docker cp test_config.json overleaf-server:/tmp/

# Установить внутри контейнера
docker exec overleaf-server bash -c "
  cd /tmp &&
  chmod +x install_overleaf.sh &&
  ./install_overleaf.sh overleaf-custom.tar.gz test_config.json
"

# Тестировать
curl http://localhost:3000/launchpad
```

---

## Сценарий 4: Тестирование с поддоменом (имитация production URL)

Используйте `/etc/hosts` для имитации настоящего домена.

### Настройка

**1. Добавьте запись в /etc/hosts:**
```bash
# macOS/Linux
sudo bash -c 'echo "127.0.0.1 overleaf.test" >> /etc/hosts'
```

**2. Создайте конфигурацию с доменом:**
```bash
cat > domain_config.json << 'EOF'
{
  "siteUrl": "http://overleaf.test:3000",
  "appName": "Overleaf Domain Test",
  "adminEmail": "admin@overleaf.test",
  "installDir": "/tmp/overleaf-domain-test",
  "port": 3000,
  "features": {
    "emailConfirmationDisabled": true
  }
}
EOF
```

**3. Установите:**
```bash
./install_overleaf.sh overleaf-custom.tar.gz domain_config.json
```

**4. Тестируйте:**
```bash
# Должно работать
curl http://overleaf.test:3000/launchpad
open http://overleaf.test:3000
```

**5. Очистка:**
```bash
sudo sed -i '' '/overleaf.test/d' /etc/hosts  # macOS
# sudo sed -i '/overleaf.test/d' /etc/hosts  # Linux
```

---

## Сценарий 5: Тестирование с Nginx Reverse Proxy (полная имитация production)

### Установка Nginx

**macOS:**
```bash
brew install nginx
```

**Linux:**
```bash
sudo apt-get install nginx
```

### Конфигурация

**1. Установите Overleaf на порт 8080:**
```json
{
  "siteUrl": "http://overleaf.local",
  "port": 8080,
  "installDir": "/tmp/overleaf-nginx-test",
  ...
}
```

**2. Настройте Nginx:**
```bash
# Создайте конфигурацию
sudo tee /etc/nginx/sites-available/overleaf.local << 'EOF'
server {
    listen 80;
    server_name overleaf.local;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 3m;
        proxy_send_timeout 3m;
    }
}
EOF

# Включите конфигурацию
sudo ln -s /etc/nginx/sites-available/overleaf.local /etc/nginx/sites-enabled/
sudo nginx -t
sudo nginx -s reload
```

**3. Добавьте в /etc/hosts:**
```bash
sudo bash -c 'echo "127.0.0.1 overleaf.local" >> /etc/hosts'
```

**4. Тестируйте:**
```bash
curl http://overleaf.local/launchpad
open http://overleaf.local
```

---

## Чек-лист для полного тестирования

- [ ] Установка завершается без ошибок
- [ ] Сервисы запускаются (docker compose ps показывает "Up")
- [ ] Страница /launchpad открывается
- [ ] Можно создать первого администратора
- [ ] Можно войти в систему
- [ ] Можно создать новый проект
- [ ] Компиляция LaTeX работает (sandboxed compiles)
- [ ] Можно загрузить файл
- [ ] Real-time редактирование работает (откройте в двух вкладках)
- [ ] Сервис доступен из локальной сети (если тестируете)
- [ ] После перезагрузки docker compose restart всё продолжает работать
- [ ] Логи не содержат критических ошибок

---

## Советы по отладке

**Проблемы с доступом:**
```bash
# Проверьте, что порт слушается
netstat -an | grep LISTEN | grep 3000
# или
lsof -i :3000

# Проверьте Docker сети
docker network ls
docker network inspect overleaf_default
```

**Проблемы с компиляцией:**
```bash
# Проверьте, что texlive-full загружен
docker images | grep texlive

# Проверьте логи CLSI
cd <installDir>
docker compose logs clsi
```

**Проблемы с MongoDB:**
```bash
# Проверьте статус replica set
docker compose exec mongo mongosh
# В mongosh:
rs.status()
```

**Мониторинг ресурсов:**
```bash
# Использование ресурсов контейнерами
docker stats

# Место на диске
du -sh <installDir>/data/*
```

---

## Автоматизированный тест-скрипт

Создайте быстрый тест-скрипт:

```bash
#!/bin/bash
# test_deployment.sh

set -e

echo "🧪 Starting deployment test..."

# 1. Подготовка
TEST_DIR="/tmp/overleaf-auto-test-$$"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# 2. Конфигурация
cat > config.json << EOF
{
  "siteUrl": "http://localhost:9999",
  "appName": "Auto Test",
  "adminEmail": "test@test.local",
  "installDir": "$TEST_DIR/overleaf",
  "port": 9999,
  "features": {"emailConfirmationDisabled": true}
}
EOF

# 3. Установка
echo "📦 Installing..."
~/path/to/install_overleaf.sh ~/path/to/overleaf-custom.tar.gz config.json

# 4. Ожидание запуска
echo "⏳ Waiting for services..."
sleep 30

# 5. Тестирование
echo "🔍 Testing..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9999/launchpad)

if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ Test PASSED - Overleaf is accessible"
    EXIT_CODE=0
else
    echo "❌ Test FAILED - HTTP code: $HTTP_CODE"
    EXIT_CODE=1
fi

# 6. Очистка
echo "🧹 Cleaning up..."
cd "$TEST_DIR/overleaf"
docker compose down -v
cd /tmp
rm -rf "$TEST_DIR"

exit $EXIT_CODE
```

Этот набор сценариев позволит вам полностью протестировать систему развертывания локально перед реальным использованием! 🚀
