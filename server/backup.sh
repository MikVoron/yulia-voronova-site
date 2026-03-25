#!/bin/bash
# Бэкап PostgreSQL → GPG → Backblaze B2
# Cron: 0 3 * * * /opt/smartplate/backup.sh >> /var/log/smartplate-backup.log 2>&1

set -e

# ── Настройки ──
DB_NAME="smartplate"
DB_USER="smartplate"
BUCKET="voronova-backups"
B2_ENDPOINT="https://s3.eu-central-003.backblazeb2.com"
B2_KEY_ID="449631c817c5"
B2_APP_KEY="00370d378e9119aee2f6676eb033db471140c12ad6"
GPG_PASSPHRASE_FILE="/opt/smartplate/.gpg-passphrase"
KEEP_DAYS=30
BACKUP_DIR="/tmp/smartplate-backups"

# ── Проверки ──
if [ ! -f "$GPG_PASSPHRASE_FILE" ]; then
    echo "$(date): ОШИБКА — нет файла $GPG_PASSPHRASE_FILE"
    exit 1
fi

command -v aws >/dev/null 2>&1 || { echo "$(date): ОШИБКА — aws cli не установлен"; exit 1; }

mkdir -p "$BACKUP_DIR"

# ── Дамп БД ──
TIMESTAMP=$(date +%Y-%m-%d_%H-%M)
DUMP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"
ENCRYPTED_FILE="${DUMP_FILE}.gpg"

echo "$(date): Начинаю бэкап..."

pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$DUMP_FILE"
echo "$(date): Дамп создан: $(du -h "$DUMP_FILE" | cut -f1)"

# ── Шифрование ──
gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase-file "$GPG_PASSPHRASE_FILE" \
    --output "$ENCRYPTED_FILE" "$DUMP_FILE"

rm "$DUMP_FILE"
echo "$(date): Зашифровано: $(du -h "$ENCRYPTED_FILE" | cut -f1)"

# ── Загрузка в B2 ──
AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
aws s3 cp "$ENCRYPTED_FILE" \
    "s3://${BUCKET}/db/${DB_NAME}_${TIMESTAMP}.sql.gz.gpg" \
    --endpoint-url "$B2_ENDPOINT"

rm "$ENCRYPTED_FILE"
echo "$(date): Загружено в B2"

# ── Удаление старых бэкапов ──
CUTOFF=$(date -d "-${KEEP_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-${KEEP_DAYS}d +%Y-%m-%d)

AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
aws s3 ls "s3://${BUCKET}/db/" --endpoint-url "$B2_ENDPOINT" | while read -r line; do
    FILE_DATE=$(echo "$line" | awk '{print $1}')
    FILE_NAME=$(echo "$line" | awk '{print $4}')
    if [ -n "$FILE_NAME" ] && [ "$FILE_DATE" \< "$CUTOFF" ]; then
        echo "$(date): Удаляю старый бэкап: $FILE_NAME"
        AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
        AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
        aws s3 rm "s3://${BUCKET}/db/${FILE_NAME}" --endpoint-url "$B2_ENDPOINT"
    fi
done

echo "$(date): Бэкап завершён успешно"
