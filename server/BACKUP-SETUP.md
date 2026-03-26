# Настройка бэкапов на VPS

## 1. Установить AWS CLI (для S3-совместимого API)

```bash
apt install -y awscli
```

## 2. Создать пароль для шифрования

```bash
openssl rand -base64 32 > /opt/voronova/.gpg-passphrase
chmod 600 /opt/voronova/.gpg-passphrase
```

**ВАЖНО:** Сохрани этот пароль отдельно (например, в заметках телефона).
Без него расшифровать бэкап невозможно!

Посмотреть пароль:
```bash
cat /opt/voronova/.gpg-passphrase
```

## 3. Настроить ключи Backblaze B2

Создай файл с секретами (доступ только root):

```bash
cat > /opt/voronova/.b2-credentials <<'EOF'
export B2_KEY_ID="твой_key_id"
export B2_APP_KEY="твой_app_key"
EOF
chmod 600 /opt/voronova/.b2-credentials
```

Ключи берутся из Backblaze B2 → App Keys.

## 4. Скопировать скрипт на VPS

```bash
cp backup.sh /opt/voronova/backup.sh
chmod +x /opt/voronova/backup.sh
```

## 5. Проверить вручную

```bash
source /opt/voronova/.b2-credentials && /opt/voronova/backup.sh
```

Должно вывести: "Бэкап завершён успешно"

## 6. Настроить cron (ежедневно в 3:00)

```bash
crontab -e
```

Добавить строку:
```
0 3 * * * . /opt/voronova/.b2-credentials && /opt/voronova/backup.sh >> /var/log/voronova-backup.log 2>&1
```

## Проверка бэкапов

После настройки cron обязательно проверь:

```bash
# 1. Бэкап создаётся (запустить вручную)
/opt/voronova/backup.sh

# 2. Файл не пустой (> 1 KB)
ls -lh /opt/voronova/backups/*.gpg | tail -1

# 3. Файл загружен в B2
AWS_ACCESS_KEY_ID="..." AWS_SECRET_ACCESS_KEY="..." \
aws s3 ls s3://voronova-backups/db/ --endpoint-url https://s3.eu-central-003.backblazeb2.com | tail -3

# 4. Тест восстановления (на тестовой БД!)
gpg --batch --decrypt --passphrase-file /opt/voronova/.gpg-passphrase <latest>.gpg | gunzip > /tmp/test.sql
psql -U smartplate -d test_restore < /tmp/test.sql
psql -U smartplate -d test_restore -c "SELECT count(*) FROM recipes;"
# Должно вернуть > 0 строк
dropdb -U smartplate test_restore  # cleanup
```

**Рекомендация:** проводить тест восстановления раз в месяц.

## Восстановление из бэкапа

```bash
# 1. Скачать бэкап
AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
aws s3 ls s3://voronova-backups/db/ --endpoint-url https://s3.eu-central-003.backblazeb2.com

# 2. Скачать нужный файл
AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$B2_APP_KEY" \
aws s3 cp s3://voronova-backups/db/smartplate_2026-03-25_03-00.sql.gz.gpg ./backup.sql.gz.gpg \
    --endpoint-url https://s3.eu-central-003.backblazeb2.com

# 3. Расшифровать
gpg --batch --decrypt --passphrase-file /opt/voronova/.gpg-passphrase backup.sql.gz.gpg | gunzip > backup.sql

# 4. Восстановить
psql -U smartplate -d smartplate < backup.sql
```
