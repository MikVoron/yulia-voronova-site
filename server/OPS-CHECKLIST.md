# Operational Checklist — Voronova Platform

Быстрая проверка состояния продакшена.

## Команды проверки

```bash
# 1. Health — API + БД
curl -s https://api.voronova.online/health | python3 -m json.tool

# 2. Backend process
pm2 status voronova-api

# 3. PostgreSQL
sudo -u postgres pg_isready

# 4. Диск
df -h /

# 5. Память
free -h

# 6. Логи (последние ошибки)
pm2 logs voronova-api --lines 50 --err

# 7. Бэкапы (последний файл)
ls -lht /opt/voronova/backups/*.gpg | head -3

# 8. SSL срок
echo | openssl s_client -connect api.voronova.online:443 -servername api.voronova.online 2>/dev/null | openssl x509 -noout -enddate

# 9. Cron задачи
crontab -l
```

## Настройка мониторинга

### 1. Telegram-алерты

1. Создать бота через [@BotFather](https://t.me/BotFather), получить токен
2. Написать боту `/start`, получить `chat_id` через `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. На VPS:

```bash
export TG_BOT_TOKEN="123456:ABC..."
export TG_CHAT_ID="your_chat_id"
```

### 2. Автоматический мониторинг (cron)

```bash
# Каждые 5 минут
*/5 * * * * TG_BOT_TOKEN=... TG_CHAT_ID=... /opt/voronova/monitor.sh >> /var/log/voronova-monitor.log 2>&1
```

### 3. Автоперезапуск (pm2)

```bash
pm2 start /opt/voronova/server/index.js --name voronova-api
pm2 save
pm2 startup   # генерирует systemd-сервис для запуска при ребуте
```

### 4. Бэкапы (cron)

```bash
# Ежедневно в 3:00
0 3 * * * /opt/voronova/backup.sh >> /var/log/voronova-backup.log 2>&1
```

### 5. Post-deploy

```bash
./post-deploy-check.sh https://api.voronova.online
```

## Файлы

| Файл | Назначение |
|------|-----------|
| `monitor.sh` | Мониторинг: health, pm2, диск, память, pg, ssl, бэкапы → Telegram |
| `post-deploy-check.sh` | Проверка после деплоя: API, БД, рецепты, авторизация, SSL |
| `backup.sh` | Бэкап БД: pg_dump → gzip → GPG → Backblaze B2 |
| `BACKUP-SETUP.md` | Инструкция настройки бэкапов |

## Восстановление из бэкапа

```bash
# Расшифровать
gpg --decrypt backup-2026-03-26.sql.gz.gpg > backup.sql.gz

# Распаковать
gunzip backup.sql.gz

# Восстановить
psql -U smartplate -d smartplate < backup.sql
```
