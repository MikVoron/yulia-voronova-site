# Настройка бэкапов на VPS

## 1. Установить AWS CLI (для S3-совместимого API)

```bash
apt install -y awscli
```

## 2. Создать пароль для шифрования

```bash
openssl rand -base64 32 > /opt/smartplate/.gpg-passphrase
chmod 600 /opt/smartplate/.gpg-passphrase
```

**ВАЖНО:** Сохрани этот пароль отдельно (например, в заметках телефона).
Без него расшифровать бэкап невозможно!

Посмотреть пароль:
```bash
cat /opt/smartplate/.gpg-passphrase
```

## 3. Скопировать скрипт на VPS

```bash
cp backup.sh /opt/smartplate/backup.sh
chmod +x /opt/smartplate/backup.sh
```

## 4. Проверить вручную

```bash
/opt/smartplate/backup.sh
```

Должно вывести: "Бэкап завершён успешно"

## 5. Настроить cron (ежедневно в 3:00)

```bash
crontab -e
```

Добавить строку:
```
0 3 * * * /opt/smartplate/backup.sh >> /var/log/smartplate-backup.log 2>&1
```

## Восстановление из бэкапа

```bash
# 1. Скачать бэкап
AWS_ACCESS_KEY_ID="449631c817c5" \
AWS_SECRET_ACCESS_KEY="00370d378e9119aee2f6676eb033db471140c12ad6" \
aws s3 ls s3://voronova-backups/db/ --endpoint-url https://s3.eu-central-003.backblazeb2.com

# 2. Скачать нужный файл
AWS_ACCESS_KEY_ID="449631c817c5" \
AWS_SECRET_ACCESS_KEY="00370d378e9119aee2f6676eb033db471140c12ad6" \
aws s3 cp s3://voronova-backups/db/smartplate_2026-03-25_03-00.sql.gz.gpg ./backup.sql.gz.gpg \
    --endpoint-url https://s3.eu-central-003.backblazeb2.com

# 3. Расшифровать
gpg --batch --decrypt --passphrase-file /opt/smartplate/.gpg-passphrase backup.sql.gz.gpg | gunzip > backup.sql

# 4. Восстановить
psql -U smartplate -d smartplate < backup.sql
```
