#!/usr/bin/env bash

cd "$(dirname "$0")/develop"

echo "🚀 Запуск Overleaf с почтовым сервером..."
echo ""

# Перезапускаем web контейнер, чтобы применить новые настройки почты
docker-compose down web 2>/dev/null
./bin/dev

echo ""
echo "✅ Готово!"
echo ""
echo "📧 Веб-интерфейс почты: http://localhost:8025"
echo "🌐 Overleaf:            http://localhost"
echo ""
echo "При регистрации письмо с подтверждением будет в Mailpit."
echo "API для чтения писем:  http://localhost:8025/api/v1/messages"
echo ""
