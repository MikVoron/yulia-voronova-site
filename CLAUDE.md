# Проект: Сайт и платформа Юлии Вороновой

## Обзор

Проект состоит из трёх частей:

1. **Основной сайт** — voronova.online (GitHub Pages, статика)
2. **Платформа «Умная тарелка»** — app.voronova.online (VPS, nginx, статика)
3. **API** — api.voronova.online (VPS, Node.js Fastify + PostgreSQL)

Всё в одном репозитории. Основная ветка — `main`, рабочая — `feature/harvard-plate`.

---

## Структура репозитория

```
/                         ← корень = основной сайт (GitHub Pages)
├── index.html            ← главная voronova.online
├── guides.html           ← список гайдов
├── guides/               ← HTML-гайды (guide-fish.html и т.д.)
├── style.css             ← стили основного сайта
├── main.js               ← JS основного сайта
├── analytics.js          ← GA + Метрика
├── data/                 ← JSON-данные для сайта
├── images/               ← картинки сайта
├── CNAME                 ← voronova.online
│
├── platform/             ← фронтенд платформы (деплоится на VPS)
│   ├── index.html        ← главная app.voronova.online
│   ├── login.html        ← авторизация
│   ├── cabinet.html      ← личный кабинет
│   ├── admin.html        ← админка
│   ├── recipe.html       ← страница рецепта
│   ├── category.html     ← категория рецептов
│   ├── data-v2.js        ← данные рецептов (36 шт, 4 категории)
│   ├── style-v4.css      ← стили «Апельсин» (NYT Cooking style) — УТВЕРЖДЁН
│   ├── cabinet.js        ← JS кабинета
│   └── admin.js          ← JS админки
│
├── server/               ← бэкенд API (деплоится на VPS)
│   ├── index.js          ← точка входа Fastify
│   ├── src/
│   │   ├── db.js         ← подключение к PostgreSQL
│   │   ├── email.js      ← отправка писем (Unisender SMTP)
│   │   ├── middleware.js  ← JWT auth middleware
│   │   ├── cron.js       ← крон-задачи (проверка подписок)
│   │   ├── audit.js      ← аудит-лог
│   │   ├── trial-guard.js ← защита триала от абьюза
│   │   └── routes/
│   │       ├── auth.js         ← email авторизация (код на почту)
│   │       ├── oauth.js        ← VK/Yandex OAuth (код готов, приложения не зарегистрированы)
│   │       ├── subscriptions.js ← подписки, платежи
│   │       ├── admin.js        ← админские эндпоинты
│   │       ├── content.js      ← рецепты из БД
│   │       ├── favorites.js    ← серверные избранные
│   │       ├── notes.js        ← серверные заметки
│   │       └── plate.js        ← серверная синхронизация тарелки
│   ├── migrate*.sql / migrate*.js ← SQL-миграции (не автоматические, применять вручную)
│   ├── backup.sh          ← скрипт бэкапов
│   └── smoke-test.sh      ← smoke-тесты после деплоя
```

---

## Домены и хостинг

| Домен | Что | Где |
|-------|-----|-----|
| `voronova.online` | Основной сайт | GitHub Pages (из ветки `main`) |
| `app.voronova.online` | Фронтенд платформы | VPS nginx → `/var/www/smartplate-platform/` |
| `api.voronova.online` | API | VPS nginx → Node.js (PM2) |

- **VPS IP:** 5.42.119.198
- **SSH:** `ssh root@5.42.119.198` (подключаться по IP, НЕ по домену!)
- **Домен:** зарегистрирован на Reg.ru
- **VPS провайдер:** Timeweb Cloud (РФ)

---

## Деплой

### Основной сайт (voronova.online)
Деплоится автоматически через GitHub Pages из ветки `main`. Push в `main` = деплой.

### Фронтенд платформы (app.voronova.online)
```bash
# Локально:
scp platform/*.html platform/*.js platform/*.css root@5.42.119.198:/var/www/smartplate-platform/
```
Перезапуск **не нужен** — nginx отдаёт как статику.

### Бэкенд API (api.voronova.online)
```bash
# Локально — роуты:
scp server/src/routes/*.js root@5.42.119.198:/var/www/smartplate-api/src/routes/

# Корневые файлы сервера:
scp server/src/*.js root@5.42.119.198:/var/www/smartplate-api/src/

# ОБЯЗАТЕЛЬНО перезапустить после деплоя бэкенда:
ssh root@5.42.119.198 "pm2 restart smartplate-api"
```

### SQL-миграции
Миграции НЕ автоматические. Применять вручную:
```bash
ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-xxx.sql
```

### Полезные команды
```bash
# Статус API
ssh root@5.42.119.198 "pm2 status"

# Логи (последние 50 строк)
ssh root@5.42.119.198 "pm2 logs smartplate-api --lines 50 --nostream"

# SQL-запрос
ssh root@5.42.119.198 "echo 'SELECT * FROM users LIMIT 5;' | sudo -u postgres psql smartplate_db"
```

---

## Технический стек

### API
- **Runtime:** Node.js + Fastify
- **БД:** PostgreSQL (имя: `smartplate_db`)
- **Процесс-менеджер:** PM2 (имя: `smartplate-api`)
- **Безопасность:** Helmet, rate limit (100 req/min на IP), CORS для конкретных доменов
- **Авторизация:** email-код → JWT access + refresh с ротацией
- **Email:** Unisender SMTP (5 типов писем: welcome, код, триал истёк, подписка истекла, оплата подтверждена)

### Фронтенд платформы
- Чистый HTML/CSS/JS, без фреймворков
- Дизайн-система: style-v4.css («Апельсин», NYT Cooking style) — утверждён, не менять стиль
- Рецепты загружаются из БД через API (ранее были только в data-v2.js)

### Основной сайт
- Чистый HTML/CSS/JS, без фреймворков
- Аналитика: Google Analytics (G-4KF0TQR0VD) + Яндекс.Метрика (106615581)

---

## Подписки и авторизация

- **Модель:** trial 7 дней → active (ручное подтверждение оплаты) → expired (крон)
- **Оплата:** ручная на карту, админ подтверждает по card_last4 + сумме + дате
- **Источник истины:** `subscriptions.status` — единственный
- **Защита триала:** один на email + fingerprint (canvas/screen/timezone SHA-256) + IP-лимит (3 за 90 дней)
- При отказе в триале аккаунт создаётся, но подписка сразу `expired` → paywall

---

## Бэкапы

- **Что:** pg_dump → gzip → GPG (AES256) → Backblaze B2
- **Бакет:** voronova-backups (EU Central)
- **Cron:** ежедневно в 3:00 UTC
- **Скрипт на VPS:** `/opt/voronova/backup.sh`
- **Локально хранит:** 3 последних, в B2 — 30 дней
- **Credentials:** `/opt/voronova/.b2-credentials`, `/opt/voronova/.gpg-passphrase`

---

## Правила работы с кодом

### Крупные фронтовые файлы
- **НЕ** запускать большой рефакторинг
- Можно: маленький локальный cleanup, если уже трогаешь файл по основной задаче
- Нельзя: переписывать целиком, менять архитектуру ради красоты, смешивать рефакторинг с багфиксом

### Рецепты
- Sidebar в рецепте показывается **только** если есть заполненные add*-массивы. Пустые = нет сайдбара
- Ингредиенты, ссылающиеся на другие рецепты — делать кликабельными через `[текст](recipeId)`
- Для **новых** рецептов выбирать `id` с понятным префиксом по типу блюда: `soup-*`, `salad-*`, `cutlets-*`, `side-*`, `sauce-*`, при необходимости `spread-*`. Папка и файлы фото должны повторять `id`. Существующие опубликованные `id` не переименовывать без отдельной миграции и проверки ссылок/БД.
- **Контракт `step.photo`** (рендер в `platform/recipe.html`, применяется и к stepper-режиму):
  - `string` → 1 фото
  - `string[]` → N фото по порядку в `.step-photo-gallery` (CSS-грид, стек на мобильном)
  - `true` → плейсхолдер-заглушка
  - `null` / `""` / отсутствует → блок фото не рендерится
  - Нормализация URL через `photoUrl()` применяется к каждой строке, не к массиву целиком
  - При добавлении мультифото в БД использовать JSON-массив строк (см. `server/migrate-borsch.sql` как пример)

### Рецепты / Ввод текстом (Text → Recipe) — постоянный контракт
Пользователь присылает рецепт **обычным текстом на русском** — AI сам парсит, валидирует и выдаёт SQL-миграцию в стиле `server/migrate-borsch.sql` (или чистый JSON по запросу). Никогда не требовать от пользователя JSON-форматирование.

- Полный контракт: [`docs/ai-recipe-input-contract.md`](docs/ai-recipe-input-contract.md) (single source of truth).
- **Режим по умолчанию: `strict` / No Guessing** (§0 контракта). Никаких выдуманных значений, «взял из прошлой версии», «разумного дефолта». Нет в тексте — `null` + вопрос в `_needs_clarification`.
- Выход — серверная схема `recipes` (snake_case). `ingredients: [{name, swap}]`, `steps: [{text, photo}]`, `photo ∈ {string | string[] | true | null}`.
- Все 4 `add_*` массива возвращаем всегда (пустой `[]` = нет сайдбара).
- Обязательный отчёт из трёх списков: `_filled_from_input`, `_needs_clarification`, `_not_provided`. Плюс опционально `_warnings` / `_todo`.
- Валидация per-field: ошибка одного поля не валит весь импорт (см. §4 контракта).

### Оценка рисков
- При оценке риска серверной фичи **всегда** проверять фронтенд/localStorage — может уже быть реализация

### Гайды (guides/guide-*.html)
При создании нового гайда **обязательно** добавить:
- GA (G-4KF0TQR0VD) + Яндекс.Метрика (106615581) + событие скачивания
- Шапка: лого 92px + ссылки
- Кнопки: «Поделиться» (TG, VK, скопировать) + «Скачать PDF»
- Футер: 3 колонки
- Цвета: --green #5b9ec9, --sage #7a98b0, --dark #1a2c3d
- Шрифты: Cormorant Garamond + Montserrat + Baskervville (лого)
- Эталон: `guides/guide-fish.html`

---

## Git-воркфлоу

- Основная ветка: `main` (деплой основного сайта через GitHub Pages)
- Рабочая ветка: `feature/harvard-plate` (вся разработка платформы)
- Git user: Mikhail Voronov
- Коммиты на русском или английском, с префиксами (Fix, Add, Update, P1/P2 для приоритетов)
- Не делать force push в main

### Перед мержем feature/harvard-plate → main (важно!)
1. **Конфликт guides.html** — feature полностью заменяет блок карточек → принять версию feature. Safari-фикс в style.css сохранится автоматически.
2. **SQL-миграции** — применить на VPS до мержа:
   - `trial_fingerprints` + колонки в `subscriptions`
   - `audit_log`

---

## Бэклог (не реализовано)
- VK/Yandex OAuth — код есть (oauth.js), нужны client_id/secret от зарегистрированных приложений
- Категории «Салаты» и «Напитки» — пустые, нужны рецепты
- Telegram Mini App — на будущее
- Обновить текст welcome-письма (`server/src/email.js`, функция `sendWelcome()`)

---

## CORS-конфигурация API

Разрешены origins:
- `https://voronova.online`
- `https://www.voronova.online`
- `https://app.voronova.online`
- В dev-режиме: `http://127.0.0.1:5500`, `http://localhost:5500`
