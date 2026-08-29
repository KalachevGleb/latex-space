#!/usr/bin/env bash
# Включает «восстановить проект до версии» (overleaf.history.rangesSupportEnabled)
# у всех проектов, где флаг ещё не стоит. Запускается при старте контейнера
# (@reboot) и раз в сутки — см. server-ce/config/crontab-history.
# Идемпотентно: уже включённые проекты пропускаются штатной миграцией Overleaf.

set -u

echo "--------------------------"
echo "Enable history ranges support for all projects"
echo "--------------------------"
date

# После старта контейнера ждём, пока web и project-history поднимутся
for i in $(seq 1 60); do
  if curl -fsS -m 3 http://127.0.0.1:4000/status >/dev/null 2>&1 \
     && curl -fsS -m 3 http://127.0.0.1:3054/status >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

# У cron нет переменных окружения контейнера (адреса mongo/redis) — берём их из
# файла, который phusion baseimage создаёт при старте, плюс адреса сервисов.
source /etc/container_environment.sh
source /etc/overleaf/env.sh
cd /overleaf/services/web \
  && /sbin/setuser www-data /usr/bin/node scripts/history/migrate_ranges_support.mjs --all --concurrency 2
echo "exit code: $?"
