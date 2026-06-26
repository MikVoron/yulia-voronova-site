#!/bin/bash
# ─── Voronova Platform Monitor ─────────────────────────────────────────────
# Проверяет здоровье сервера и отправляет алерт в Telegram при проблемах.
# Запускать через cron каждые 5 минут:
#   */5 * * * * /opt/voronova/monitor.sh >> /var/log/voronova-monitor.log 2>&1

set -euo pipefail

# ── Настройки ──────────────────────────────────────────────────────────────
API_URL="${API_URL:-https://api.voronova.online}"
TG_BOT_TOKEN="${TG_BOT_TOKEN:-}"
TG_CHAT_ID="${TG_CHAT_ID:-}"
DISK_WARN_PCT=85
MEM_WARN_PCT=90
PM2_APP_NAME="${PM2_APP_NAME:-smartplate-api}"
BACKUP_DIR="${BACKUP_DIR:-/opt/voronova/backups}"
BACKUP_MAX_AGE_HOURS=26  # бэкап должен быть моложе 26 часов

ERRORS=""

# ── Функции ────────────────────────────────────────────────────────────────
send_tg() {
  [ -z "$TG_BOT_TOKEN" ] && return
  [ -z "$TG_CHAT_ID" ] && return
  curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -d chat_id="$TG_CHAT_ID" \
    -d parse_mode=HTML \
    -d text="$1" > /dev/null 2>&1 || true
}

fail() {
  ERRORS="${ERRORS}\n❌ $1"
}

ok() {
  echo "[$(date '+%H:%M:%S')] ✓ $1"
}

# ── 1. Health endpoint ─────────────────────────────────────────────────────
HTTP_CODE=$(curl -s -o /tmp/health.json -w "%{http_code}" "${API_URL}/health" --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  DB_STATUS=$(cat /tmp/health.json | grep -o '"db":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
  if [ "$DB_STATUS" = "ok" ]; then
    ok "health: API + DB"
  else
    fail "API доступен, но БД недоступна (db=$DB_STATUS)"
  fi
else
  fail "API недоступен (HTTP $HTTP_CODE)"
fi

# ── 2. PM2 process ────────────────────────────────────────────────────────
if command -v pm2 &>/dev/null; then
  PM2_STATUS=$(pm2 jlist 2>/dev/null | grep -o "\"name\":\"${PM2_APP_NAME}\"[^}]*\"status\":\"[^\"]*\"" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "not_found")
  if [ "$PM2_STATUS" = "online" ]; then
    ok "pm2: ${PM2_APP_NAME} online"
  else
    fail "PM2 ${PM2_APP_NAME}: статус '${PM2_STATUS}'"
  fi
else
  ok "pm2: не установлен (пропуск)"
fi

# ── 3. Диск ────────────────────────────────────────────────────────────────
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_PCT" -ge "$DISK_WARN_PCT" ]; then
  fail "Диск: ${DISK_PCT}% занято (порог ${DISK_WARN_PCT}%)"
else
  ok "disk: ${DISK_PCT}%"
fi

# ── 4. Память ──────────────────────────────────────────────────────────────
MEM_PCT=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$MEM_PCT" -ge "$MEM_WARN_PCT" ]; then
  fail "Память: ${MEM_PCT}% использовано (порог ${MEM_WARN_PCT}%)"
else
  ok "memory: ${MEM_PCT}%"
fi

# ── 5. PostgreSQL ──────────────────────────────────────────────────────────
if command -v pg_isready &>/dev/null; then
  if pg_isready -q 2>/dev/null; then
    ok "postgresql: ready"
  else
    fail "PostgreSQL не отвечает (pg_isready)"
  fi
fi

# ── 6. SSL сертификат ──────────────────────────────────────────────────────
API_HOST=$(echo "$API_URL" | sed -E 's|https?://||;s|/.*||;s|:.*||')
SSL_EXPIRY=$(echo | openssl s_client -connect "${API_HOST}:443" -servername "$API_HOST" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")
if [ -n "$SSL_EXPIRY" ]; then
  SSL_EPOCH=$(date -d "$SSL_EXPIRY" +%s 2>/dev/null || echo "0")
  NOW_EPOCH=$(date +%s)
  DAYS_LEFT=$(( (SSL_EPOCH - NOW_EPOCH) / 86400 ))
  if [ "$DAYS_LEFT" -lt 7 ]; then
    fail "SSL истекает через ${DAYS_LEFT} дней! ($SSL_EXPIRY)"
  else
    ok "ssl: ${DAYS_LEFT} дней до истечения"
  fi
fi

# ── 7. Бэкапы ─────────────────────────────────────────────────────────────
if [ -d "$BACKUP_DIR" ]; then
  LATEST=$(find "$BACKUP_DIR" -name "*.gpg" -type f -mmin -$((BACKUP_MAX_AGE_HOURS * 60)) 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    SIZE=$(stat --printf='%s' "$LATEST" 2>/dev/null || echo "0")
    if [ "$SIZE" -gt 1000 ]; then
      ok "backup: свежий ($(basename "$LATEST"), $(( SIZE / 1024 )) KB)"
    else
      fail "Последний бэкап подозрительно мал (${SIZE} байт)"
    fi
  else
    fail "Нет свежих бэкапов за ${BACKUP_MAX_AGE_HOURS} часов"
  fi
fi

# ── Итог ───────────────────────────────────────────────────────────────────
if [ -n "$ERRORS" ]; then
  MSG="🚨 <b>Voronova Monitor</b>\n$(date '+%Y-%m-%d %H:%M')\n${ERRORS}"
  echo -e "\n$MSG"
  send_tg "$MSG"
  exit 1
else
  echo "[$(date '+%H:%M:%S')] All checks passed"
fi
