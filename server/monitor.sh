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
TG_ENV_FILE="${TG_ENV_FILE:-/var/www/smartplate-api/.env}"
DISK_WARN_PCT=85
MEM_WARN_PCT=90
PM2_APP_NAME="${PM2_APP_NAME:-smartplate-api}"
BACKUP_DIR="${BACKUP_DIR:-/opt/voronova/backups}"
BACKUP_MAX_AGE_HOURS=26  # бэкап должен быть моложе 26 часов
CONTENT_WARN_SECONDS="${CONTENT_WARN_SECONDS:-4}"
CONTENT_MIN_BYTES="${CONTENT_MIN_BYTES:-1000}"

ERRORS=""
TMP_DIR="$(mktemp -d)"
chmod 700 "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT
HEALTH_FILE="$TMP_DIR/health.json"
RECIPES_FILE="$TMP_DIR/recipes.json"

# ── Функции ────────────────────────────────────────────────────────────────
read_pm2_status() {
  pm2 jlist 2>/dev/null | PM2_APP_NAME="$PM2_APP_NAME" node -e "
    let input = '';
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', () => {
      try {
        const apps = JSON.parse(input || '[]');
        const app = apps.find(item => item.name === process.env.PM2_APP_NAME);
        console.log(app?.pm2_env?.status || 'not_found');
      } catch (_) {
        console.log('parse_error');
      }
    });
  " || echo "not_found"
}

read_env_value() {
  local key="$1"
  [ -f "$TG_ENV_FILE" ] || return 0
  grep -m1 "^${key}=" "$TG_ENV_FILE" 2>/dev/null | cut -d= -f2- || true
}

if [ -z "$TG_BOT_TOKEN" ]; then
  TG_BOT_TOKEN="$(read_env_value TG_BOT_TOKEN)"
fi
if [ -z "$TG_CHAT_ID" ]; then
  TG_CHAT_ID="$(read_env_value TG_CHAT_ID)"
fi

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
HTTP_CODE=$(curl -s -o "$HEALTH_FILE" -w "%{http_code}" "${API_URL}/health" --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  DB_STATUS=$(grep -o '"db":"[^"]*"' "$HEALTH_FILE" | cut -d'"' -f4 || echo "unknown")
  if [ "$DB_STATUS" = "ok" ]; then
    ok "health: API + DB"
  else
    fail "API доступен, но БД недоступна (db=$DB_STATUS)"
  fi
else
  fail "API недоступен (HTTP $HTTP_CODE)"
fi

# ── 2. Реальный пользовательский endpoint каталога ───────────────────────
# /health делает только лёгкую DB-проверку и может быть зелёным, даже если
# каталог зависает. Здесь проверяем nginx → API → SQL → валидный JSON целиком.
CONTENT_RESULT=$(curl --compressed -sS -o "$RECIPES_FILE" \
  -w "%{http_code} %{time_total} %{size_download}" \
  "${API_URL}/content/recipes" --connect-timeout 5 --max-time 12 2>/dev/null || echo "000 12 0")
read -r CONTENT_CODE CONTENT_TIME CONTENT_BYTES <<< "$CONTENT_RESULT"
CONTENT_FIRST_CHAR=$(head -c 1 "$RECIPES_FILE" 2>/dev/null || echo "")
if [ "$CONTENT_CODE" != "200" ]; then
  fail "Каталог рецептов недоступен (HTTP ${CONTENT_CODE}, ${CONTENT_TIME}s)"
elif [ "$CONTENT_FIRST_CHAR" != "[" ] || [ "$CONTENT_BYTES" -lt "$CONTENT_MIN_BYTES" ]; then
  fail "Каталог вернул неполный ответ (${CONTENT_BYTES} байт, ${CONTENT_TIME}s)"
elif awk -v value="$CONTENT_TIME" -v limit="$CONTENT_WARN_SECONDS" 'BEGIN { exit !(value > limit) }'; then
  fail "Каталог отвечает медленно: ${CONTENT_TIME}s (порог ${CONTENT_WARN_SECONDS}s)"
else
  ok "catalog: HTTP 200, ${CONTENT_TIME}s, ${CONTENT_BYTES} bytes compressed"
fi

# ── 3. PM2 process ────────────────────────────────────────────────────────
if command -v pm2 &>/dev/null; then
  PM2_STATUS="$(read_pm2_status)"
  if [ "$PM2_STATUS" != "online" ]; then
    sleep 3
    PM2_STATUS="$(read_pm2_status)"
  fi
  if [ "$PM2_STATUS" = "online" ]; then
    ok "pm2: ${PM2_APP_NAME} online"
  else
    fail "PM2 ${PM2_APP_NAME}: статус '${PM2_STATUS}'"
  fi
else
  ok "pm2: не установлен (пропуск)"
fi

# ── 4. Диск ────────────────────────────────────────────────────────────────
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_PCT" -ge "$DISK_WARN_PCT" ]; then
  fail "Диск: ${DISK_PCT}% занято (порог ${DISK_WARN_PCT}%)"
else
  ok "disk: ${DISK_PCT}%"
fi

# ── 5. Память ──────────────────────────────────────────────────────────────
MEM_PCT=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$MEM_PCT" -ge "$MEM_WARN_PCT" ]; then
  fail "Память: ${MEM_PCT}% использовано (порог ${MEM_WARN_PCT}%)"
else
  ok "memory: ${MEM_PCT}%"
fi

# ── 6. PostgreSQL ──────────────────────────────────────────────────────────
if command -v pg_isready &>/dev/null; then
  if pg_isready -q 2>/dev/null; then
    ok "postgresql: ready"
  else
    fail "PostgreSQL не отвечает (pg_isready)"
  fi
fi

# ── 7. SSL сертификат ──────────────────────────────────────────────────────
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

# ── 8. Бэкапы ─────────────────────────────────────────────────────────────
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
