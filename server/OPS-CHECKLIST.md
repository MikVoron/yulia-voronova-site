# Operational Checklist — Voronova Platform

Быстрая справка по эксплуатации.

## 1. Deploy

### Фронтенд (статика, nginx — перезапуск не нужен)
```bash
scp platform/*.html platform/*.js platform/*.css root@5.42.119.198:/var/www/smartplate-platform/
```

### Бэкенд (Node.js API — нужен pm2 restart)
```bash
# Роуты
scp server/src/routes/*.js root@5.42.119.198:/var/www/smartplate-api/src/routes/
# Корневые модули (db, audit, middleware, email)
scp server/src/*.js root@5.42.119.198:/var/www/smartplate-api/src/
# Перезапуск
ssh root@5.42.119.198 "pm2 restart smartplate-api"
```

### Post-deploy
```bash
# Smoke-тесты (23 проверки: health, headers, CORS, auth, rate limits, 404)
bash server/smoke-test.sh https://api.voronova.online
# Или расширенная проверка
ssh root@5.42.119.198 "/var/www/smartplate-api/post-deploy-check.sh https://api.voronova.online"
```

## 2. Migrations

```bash
# Локально → VPS (копирует файлы + запускает)
bash server/migrate.sh --remote

# На VPS напрямую
cd /var/www/smartplate-api && bash migrate.sh
```

Файлы миграций: `server/migrations/*.sql`
Трекинг: таблица `schema_migrations` (автоматически, идемпотентно).

## 3. Health-проверки

```bash
# API + БД
curl -s https://api.voronova.online/health | python3 -m json.tool

# Процесс
ssh root@5.42.119.198 "pm2 status smartplate-api"

# PostgreSQL
ssh root@5.42.119.198 "sudo -u postgres pg_isready"

# Диск + память
ssh root@5.42.119.198 "df -h / && free -h"

# Последние ошибки
ssh root@5.42.119.198 "pm2 logs smartplate-api --lines 50 --err --nostream"
```

## 4. Бэкапы

- Cron: ежедневно 3:00 → pg_dump → gzip → GPG → Backblaze B2
- Подробная настройка: `BACKUP-SETUP.md`

```bash
# Последний файл
ssh root@5.42.119.198 "ls -lht /opt/voronova/backups/*.gpg | head -3"

# Тест восстановления (на тестовой БД!)
ssh root@5.42.119.198 "gpg --batch --decrypt --passphrase-file /opt/voronova/.gpg-passphrase <file>.gpg | gunzip > /tmp/test.sql && psql -U smartplate -d test_restore < /tmp/test.sql"
```

## 5. SSL

```bash
ssh root@5.42.119.198 "echo | openssl s_client -connect api.voronova.online:443 -servername api.voronova.online 2>/dev/null | openssl x509 -noout -enddate"
```

Certbot с автообновлением (Let's Encrypt).

## 6. SMTP

Email отправляется через Nodemailer (настройки в `.env` на VPS).
Используется для: код авторизации, подтверждение оплаты, ответ на обращение, newsletter.

```bash
# Проверить отправку — отправить тестовый код авторизации
curl -s -X POST https://api.voronova.online/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## 7. Cron-задачи

```bash
ssh root@5.42.119.198 "crontab -l"
```

| Задача | Расписание | Скрипт |
|--------|-----------|--------|
| Бэкап БД | 0 3 * * * | `/opt/voronova/backup.sh` |
| Мониторинг | */5 * * * * | `/opt/voronova/monitor.sh` |

## 8. Мониторинг (Telegram-алерты)

`monitor.sh` проверяет: health, pm2, диск, память, pg, ssl, бэкапы → отправляет в Telegram при проблемах.

Настройка: переменные `TG_BOT_TOKEN` и `TG_CHAT_ID` в crontab.

## 9. Security Headers

### Проверка API (api.voronova.online)

```bash
curl -sI https://api.voronova.online/health | grep -iE 'strict-transport|content-type-options|referrer-policy|permissions-policy|x-frame|x-dns'
```

Ожидается:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
X-Frame-Options: SAMEORIGIN
X-DNS-Prefetch-Control: off
```

### Проверка платформы (app.voronova.online)

```bash
curl -sI https://app.voronova.online/ | grep -iE 'strict-transport|content-security|content-type-options|x-frame|referrer-policy|permissions-policy'
```

Ожидается:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' ...; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'
```

### Таблица заголовков

| Заголовок | API | Платформа | Источник |
|-----------|-----|-----------|----------|
| `Strict-Transport-Security` | max-age=31536000 | max-age=31536000 | nginx |
| `X-Content-Type-Options` | nosniff | nosniff | nginx |
| `Referrer-Policy` | strict-origin-when-cross-origin | strict-origin-when-cross-origin | nginx |
| `Permissions-Policy` | camera=(), microphone=(), geolocation=(), payment=() | camera=(), microphone=(), geolocation=(), payment=() | nginx |
| `Content-Security-Policy` | — | да | nginx |
| `X-Frame-Options` | SAMEORIGIN | DENY | nginx |

### Конфигурация nginx

```
/etc/nginx/sites-available/api.voronova.online
/etc/nginx/sites-available/app.voronova.online
```

Бэкапы: `*.bak` в той же папке. После изменения: `nginx -t && systemctl reload nginx`.

Кнопка поддержки SmartPlate показывает официальный Tawk Direct Chat Link во
встроенном iframe. Для него разрешён только точный `https://tawk.to` в
`frame-src` и `child-src`. Не добавлять `*.tawk.to` или широкое разрешение
`https:`: внутренние ресурсы чата загружаются в документе поставщика.

## Файлы

| Файл | Назначение |
|------|-----------|
| `smoke-test.sh` | smoke-тесты после деплоя |
| `post-deploy-check.sh` | Расширенная проверка: API, БД, рецепты, авторизация, SSL |
| `migrate.sh` | Миграции с трекингом (`schema_migrations`) |
| `monitor.sh` | Мониторинг → Telegram |
| `backup.sh` | Бэкап: pg_dump → gzip → GPG → B2 |
| `BACKUP-SETUP.md` | Инструкция настройки бэкапов с нуля |
