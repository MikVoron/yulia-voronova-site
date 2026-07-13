# SmartPlate API — Backend

API-сервер для платформы «Умная тарелка» (app.voronova.online).

## Стек

- **Runtime:** Node.js (v18+)
- **Framework:** Fastify 5
- **БД:** PostgreSQL
- **Процесс-менеджер (прод):** PM2

## Установка

```bash
cd server
npm install
```

## Переменные окружения

Создайте `.env` в папке `server/`:

```env
# Обязательные
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/smartplate_db
JWT_SECRET=your-secret-key-here
ADMIN_TOTP_SECRET=base32-secret-from-your-authenticator
NODE_ENV=development

# SMTP (отправка кодов и уведомлений)
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM="Юлия Воронова <noreply@voronova.online>"

# Опциональные — уведомление админу о новых регистрациях
NEW_USER_NOTIFY_ENABLED=true                 # false отключает (по умолчанию включено)
NEW_USER_NOTIFY_TO=hello@voronova.online     # получатель уведомления

# Опциональные — Telegram-алерты и команды статуса
TG_BOT_TOKEN=                                # токен от @BotFather, хранить только в env
TG_CHAT_ID=                                  # личный chat_id владельца
TG_BOT_POLLING=true                          # false отключает ответы на /status, алерты останутся
TG_ALERT_MIN_INTERVAL_MS=300000              # антиспам для одинаковых алертов, 5 минут по умолчанию

# Опциональные — OAuth (пока не активны)
VK_APP_ID=
VK_APP_SECRET=
VK_REDIRECT=https://api.voronova.online/auth/oauth/vk/callback
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
YANDEX_REDIRECT=https://api.voronova.online/auth/oauth/yandex/callback

# Опциональные — внешние сервисы
ANTHROPIC_API_KEY=             # AI-генерация (если используется)
UNISENDER_API_KEY=             # Unisender (альтернативный email)
USDA_API_KEY=                  # USDA FoodData Central
PLATFORM_URL=https://app.voronova.online
```

## Запуск (dev)

```bash
# Убедитесь, что PostgreSQL запущен и база создана:
createdb smartplate_db

# Применить миграции (в порядке нумерации):
cat migrate-*.sql | psql smartplate_db

# Запуск:
node index.js
```

Сервер стартует на `http://localhost:3000`. Проверка: `curl http://localhost:3000/health`.

## Запуск (прод)

```bash
pm2 start index.js --name smartplate-api
pm2 save
```

`ADMIN_TOTP_SECRET` обязателен для входа пользователей с ролью `admin` и должен
совпадать с секретом, добавленным в приложение-аутентификатор. Если переменная
не задана, сервер намеренно запрещает административный вход. Храните секрет
только в переменных окружения production-сервера, не в Git.

Telegram-бот отвечает только чату из `TG_CHAT_ID`. Доступные команды:

```text
/status  — полный статус API, DB, пользователей, платежей, обращений и cron
/health  — короткая проверка API + DB
/ping    — проверка, что polling жив
/help    — список команд
```

Для системного мониторинга через `server/monitor.sh` задайте те же `TG_BOT_TOKEN` и `TG_CHAT_ID` в окружении cron/скрипта. Это покрывает случаи, когда сам API-процесс недоступен и не может ответить боту.

## Тесты

```bash
npm test
```

Запускает набор unit/integration тестов через Vitest. Тесты используют моки БД и внешних сервисов, PostgreSQL не требуется.

## Структура

```
server/
├── index.js              — точка входа Fastify
├── package.json
├── .env                   — переменные окружения (не в git!)
├── src/
│   ├── auth.js            — JWT: генерация/верификация токенов
│   ├── db.js              — подключение к PostgreSQL
│   ├── email.js           — отправка писем (SMTP)
│   ├── middleware.js       — authenticate middleware (JWT)
│   ├── cron.js            — крон (проверка подписок, каждый час)
│   ├── audit.js           — аудит-лог действий
│   ├── trial-guard.js     — защита триала от абьюза
│   └── routes/
│       ├── auth.js        — email-авторизация (код на почту)
│       ├── oauth.js       — VK/Yandex OAuth
│       ├── subscriptions.js — подписки, платежи
│       ├── admin.js       — админские эндпоинты
│       ├── content.js     — рецепты, категории, новости
│       ├── favorites.js   — избранные рецепты
│       ├── notes.js       — заметки к рецептам
│       ├── plate.js       — синхронизация тарелки
│       ├── ai.js          — AI-эндпоинты
│       └── nutrition.js   — нутриенты
├── __tests__/             — тесты (Vitest)
├── migrate-*.sql          — SQL-миграции (ручные)
├── smoke-test.sh          — smoke-тесты прода (bash)
└── backup.sh              — скрипт бэкапов
```

## Troubleshooting

**Сервер не стартует — `Cannot find module './src/auth'`**
Убедитесь, что `src/auth.js` существует. Этот файл содержит JWT-хелперы.

**`ECONNREFUSED` при подключении к БД**
Проверьте `DATABASE_URL` в `.env` и что PostgreSQL запущен: `pg_isready`.

**CORS-ошибки в браузере**
Разрешённые origins: `voronova.online`, `www.voronova.online`, `app.voronova.online`.
В dev: `127.0.0.1:5500`, `localhost:5500`. Проверьте, что фронтенд работает на одном из них.

**Rate-limit блокирует запросы**
Лимит: 100 req/min на IP. За nginx убедитесь, что `trustProxy: true` в index.js и nginx передаёт `X-Forwarded-For`.

**PM2: сервер перезапускается в цикле**
```bash
pm2 logs smartplate-api --lines 50 --nostream
```
Частая причина — отсутствие `.env` или ошибка в миграциях.
