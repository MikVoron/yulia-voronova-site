# Умная тарелка — MVP подписочного доступа

## Техническое задание v1.7 (финал)
Дата: 2026-03-21
Статус: финальная версия

---

## 1. Цель

Запустить подписочный доступ к платформе «Умная тарелка» (voronova.online/platform) с минимальными затратами, проверить спрос, получить первых платящих пользователей. Архитектура стартовая — рассчитана на эволюцию.

---

## 2. Требования

### 2.1. Функциональные
- Авторизация по email (код, без пароля), VK ID, Yandex ID
- Бесплатный триал 7 дней с ограниченным доступом (часть рецептов заблокирована)
- Платная подписка — ручное подтверждение администратором
- Автоматическое отключение доступа при истечении подписки (ежедневная проверка)
- Email-уведомления: welcome, код входа, конец триала, конец подписки, подтверждение оплаты
- Админ-панель для управления пользователями и подписками

### 2.2. Юридические
- Персональные данные хранятся в РФ (152-ФЗ)
- VPS и хранилище — российский дата-центр (Москва / Санкт-Петербург)
- Почтовый сервис — хранение данных в РФ (Unisender, ДЦ Москва)

### 2.3. Нефункциональные
- До ~1000 пользователей без смены архитектуры
- Время отклика API < 300мс
- Ежедневные бэкапы БД с проверкой восстановления

---

## 3. Архитектура

### 3.1. Общая схема

```
┌─────────────────────┐         ┌──────────────────────────────┐
│   GitHub Pages      │  HTTPS  │   VPS (Timeweb Cloud, РФ)    │
│   voronova.online   │ ◄─────► │   api.voronova.online        │
│                     │         │                              │
│   Статика + JS      │         │   Nginx (reverse proxy, SSL) │
│   JWT в памяти      │         │   Node.js (Fastify)          │
│   Refresh в cookie  │         │   PostgreSQL                 │
└─────────────────────┘         │   Cron (подписки, бэкапы)    │
                                └──────────┬───────────────────┘
                                           │
                                    ┌──────▼──────┐
                                    │  S3 (РФ)    │
                                    │  Бэкапы БД  │
                                    │  (шифров.)  │
                                    └─────────────┘
                                           │
                                    ┌──────▼──────┐
                                    │  Unisender  │
                                    │  SMTP API   │
                                    └─────────────┘
```

### 3.2. Где хранятся персональные данные

| Хранилище | Что хранится | Расположение | ПДн |
|-----------|-------------|--------------|-----|
| PostgreSQL (VPS) | Все данные: users, auth, подписки, платежи, логи | Москва, Timeweb | Да — основное хранилище ПДн |
| S3 (Timeweb) | Зашифрованные дампы БД (GPG). Прямого доступа к ПДн нет | Москва, Timeweb | Да (в зашифрованном виде) |
| Unisender | Email + имя пользователя (минимум для отправки) | Москва, Unisender РФ | Да — минимальный набор |
| GitHub Pages | Статика, JS. Никаких ПДн | США | Нет |
| Браузер клиента | Access token (в памяти), refresh (httpOnly cookie) | Устройство пользователя | Токены не содержат ПДн напрямую, но являются чувствительными данными доступа. Защита: httpOnly, secure, SameSite=Strict, короткий TTL |

> Все компоненты, содержащие ПДн, размещены в РФ. Unisender — российский сервис с ДЦ в Москве. При смене почтового сервиса необходимо проверить локацию хранения.

### 3.3. Инфраструктура

| Компонент | Решение | Стоимость |
|-----------|---------|-----------|
| VPS | Timeweb Cloud, 2 vCPU / 4 GB RAM / 50 GB SSD, Москва | ~1 200 руб/мес |
| Публичный IP | Статический IPv4 | ~180 руб/мес |
| S3-хранилище | Timeweb S3 (бэкапы БД, шифрование at rest) | ~50-100 руб/мес |
| SSL | Let's Encrypt (бесплатно) | 0 |
| Email-рассылки | Unisender, бесплатный до 1 500 контактов | 0 |
| Домен | Уже есть (Reg.ru) | 0 |
| **Итого** | | **~1 500 - 1 600 руб/мес** |

При росте (SMTP платный тариф, больше S3, мощнее VPS): **2 500 - 5 500 руб/мес**.

### 3.4. Критерии выноса PostgreSQL в managed DB
Не привязан к конкретному числу пользователей. Триггеры:
- Рост нагрузки (CPU БД > 60% стабильно)
- Медленные запросы (> 500мс)
- Проблемы с бэкапами / восстановлением
- Необходимость обновлять ОС/Node без риска уронить БД
- Критичность для бизнеса (платящие пользователи зависят от аптайма)

Ориентир: ~100+ платящих пользователей.

---

## 4. База данных

### 4.1. Таблицы

#### users
```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) UNIQUE,           -- UNIQUE, но допускает NULL (вход через VK без email)
    avatar_url    TEXT,
    role          VARCHAR(20) NOT NULL DEFAULT 'user',  -- user | admin
    trial_used_at TIMESTAMPTZ,                   -- когда активирован триал (NULL = не использован)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
> `email` — UNIQUE, но nullable. Пользователь может войти через VK без email. В этом случае email = NULL.

#### auth_accounts
```sql
CREATE TABLE auth_accounts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         VARCHAR(20) NOT NULL,        -- email | vk | yandex
    provider_user_id VARCHAR(255) NOT NULL,        -- ID у провайдера (для email = сам email)
    email            VARCHAR(255),                 -- email от провайдера (может отличаться от users.email)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)             -- один аккаунт провайдера = один auth_account
);
```
> Один пользователь может иметь несколько auth_accounts (email + VK + Yandex). Связь: user_id → users.id.

#### login_codes
```sql
CREATE TABLE login_codes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) NOT NULL,
    code_hash  VARCHAR(64) NOT NULL,              -- SHA-256 от кода (не сам код!)
    attempts   INT NOT NULL DEFAULT 0,            -- защита от перебора (макс 5)
    expires_at TIMESTAMPTZ NOT NULL,              -- TTL 10 минут
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
> Код генерируется, отправляется пользователю, в БД сохраняется только SHA-256 хеш. При проверке: хешируем введённый код и сравниваем с code_hash. Компрометация БД не даёт рабочих кодов. Коды живут 10 минут. После 5 неверных попыток код блокируется. Старые коды очищаются крон-задачей.

#### refresh_sessions
```sql
CREATE TABLE refresh_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(64) NOT NULL,       -- SHA-256 от refresh token
    user_agent         TEXT,
    ip                 VARCHAR(45),
    expires_at         TIMESTAMPTZ NOT NULL,       -- 30 дней
    revoked_at         TIMESTAMPTZ,                -- NULL = активна, дата = отозвана
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
> Таблица хранит именно refresh-сессии. Ротация: при каждом /auth/refresh старый токен отзывается (revoked_at = NOW), выдаётся новый.

#### subscriptions
```sql
CREATE TYPE sub_status AS ENUM ('trial', 'active', 'expired', 'cancelled', 'blocked');

CREATE TABLE subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,  -- один пользователь = одна подписка
    status      sub_status NOT NULL DEFAULT 'trial',
    trial_ends  TIMESTAMPTZ,                      -- trial_used_at + 7 дней
    paid_until  TIMESTAMPTZ,                      -- до какой даты оплачено
    fingerprint VARCHAR(64),                      -- антиабуз: хеш fingerprint устройства при активации триала
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Источник истины для доступа:** поле `subscriptions.status` — единственный источник.
Поля `trial_ends` и `paid_until` — входные данные для ежедневного крона, который обновляет `status`.
API при проверке доступа читает `status`, с fallback-проверкой дат на случай сбоя крона (раздел 6.6).

#### payments
```sql
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    amount          INT NOT NULL,                  -- в копейках
    method          VARCHAR(50) NOT NULL DEFAULT 'card_manual',  -- card_manual | (будущее: yukassa, tinkoff)
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | confirmed | rejected
    card_last4      VARCHAR(4),                    -- последние 4 цифры карты отправителя
    user_comment    TEXT,                           -- комментарий пользователя
    transfer_date   DATE,                          -- дата перевода (указывает пользователь)
    confirmed_by    UUID REFERENCES users(id),     -- какой админ подтвердил
    confirmed_at    TIMESTAMPTZ,
    period_start    DATE,                          -- заполняется админом при подтверждении
    period_end      DATE,                          -- заполняется админом при подтверждении
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
> Пользователь создаёт запись (status=pending) с суммой, датой перевода и card_last4. Админ сверяет с выпиской и подтверждает.

#### promo_codes
```sql
CREATE TABLE promo_codes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(30) UNIQUE NOT NULL,     -- UNIQUE — один код, одна запись
    type          VARCHAR(20) NOT NULL,            -- trial_extend | free_month | discount
    value         INT NOT NULL,                    -- дни или процент
    max_uses      INT,
    used_count    INT NOT NULL DEFAULT 0,
    expires_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### audit_logs
```sql
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),         -- над кем действие
    actor_id    UUID REFERENCES users(id),         -- кто выполнил (admin или сам user)
    action      VARCHAR(50) NOT NULL,
    details     JSONB,                             -- доп. данные (IP, сумма, период, промокод)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Действия в audit_logs:
| action | Описание | actor_id |
|--------|----------|----------|
| login | Вход пользователя | user_id |
| logout | Выход | user_id |
| trial_start | Активация триала | user_id |
| payment_confirmed | Подтверждение оплаты | admin |
| subscription_extended | Продление подписки | admin |
| subscription_expired | Автоистечение подписки | system (NULL) |
| subscription_blocked | Ручная блокировка | admin |
| subscription_unblocked | Разблокировка | admin |
| promo_applied | Применён промокод | user_id |
| recipe_view | Просмотр рецепта (для MAU) | user_id |
| plate_add | Добавление в тарелку (для MAU) | user_id |
| suspicious_trial | Подозрительная активация триала | user_id |

#### cron_runs
```sql
CREATE TABLE cron_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job           VARCHAR(50) NOT NULL,            -- check_subscriptions | cleanup_codes | backup_db
    status        VARCHAR(20) NOT NULL,            -- success | error
    affected_rows INT DEFAULT 0,
    error         TEXT,
    finished_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
> Каждый запуск крона записывает результат. Мониторинг: алерт если нет записи за последние 25 часов.

### 4.2. Индексы
```sql
CREATE INDEX idx_auth_accounts_user ON auth_accounts(user_id);
CREATE INDEX idx_refresh_sessions_user ON refresh_sessions(user_id);
CREATE INDEX idx_refresh_sessions_token ON refresh_sessions(refresh_token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_subscriptions_status ON subscriptions(status, paid_until);
CREATE INDEX idx_login_codes_email ON login_codes(email, expires_at);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at);
CREATE INDEX idx_payments_user ON payments(user_id, created_at);
```

### 4.3. Ограничения (сводка)

| Таблица | Ограничение | Тип |
|---------|-------------|-----|
| users.email | UNIQUE (nullable) | UNIQUE |
| auth_accounts(provider, provider_user_id) | Один аккаунт провайдера | UNIQUE |
| subscriptions.user_id | Одна подписка на пользователя | UNIQUE |
| promo_codes.code | Один код | UNIQUE |
| payments.status | Обязателен | NOT NULL DEFAULT 'pending' |
| users.role | Обязателен | NOT NULL DEFAULT 'user' |
| login_codes.attempts | Обязателен | NOT NULL DEFAULT 0 |

---

## 5. Авторизация

### 5.1. Провайдеры (MVP)

| Провайдер | Метод | Приоритет |
|-----------|-------|-----------|
| Email | 6-значный код, TTL 10 мин, макс 5 попыток | Основной |
| VK ID | OAuth 2.0 | Основной |
| Yandex ID | OAuth 2.0 | Основной |
| Google | OAuth 2.0 | Отложен (после MVP) |
| Apple | OAuth 2.0 | Отложен (только если iOS-приложение) |

### 5.2. Схема токенов

```
Access Token (JWT)
├── Хранение: в памяти JS (не localStorage, не cookie)
├── TTL: 15 минут
├── Payload: { user_id, role, sub_status }
└── Подпись: HS256, секрет на сервере

Refresh Token
├── Хранение: httpOnly secure cookie (SameSite=Strict)
├── TTL: 30 дней
├── В БД: SHA-256 хэш + user_agent + ip + revoked_at
└── Ротация: при каждом использовании старый отзывается, выдаётся новый
```

### 5.3. Поток авторизации (email)

```
1. Пользователь вводит email
2. POST /auth/send-code { email }
   → rate limit: 3 кода / email / час, 10 / IP / час
   → генерация 6-значного кода
   → сохранение SHA-256(код) в login_codes.code_hash (TTL 10 мин)
   → отправка кода письмом через Unisender SMTP
3. Пользователь вводит код
4. POST /auth/verify-code { email, code }
   → SHA-256(введённый код) сравнивается с code_hash
   → проверка: совпадение, TTL, attempts < 5
   → создание/поиск пользователя
   → создание auth_account (если нет)
   → генерация access + refresh token
   → если первый вход: trial_used_at = NOW(), subscription.status = trial
   → audit_log: login
   → если первый вход: audit_log: trial_start (отдельная запись для метрик и антиабуза)
5. Ответ: { accessToken } + httpOnly cookie с refresh token
```

### 5.4. Поток авторизации (VK / Yandex)

```
1. GET /auth/oauth/vk → редирект на провайдер
2. Пользователь авторизуется у провайдера
3. Провайдер редиректит на GET /auth/oauth/callback?provider=vk&code=...
   → обмен code → access_token у провайдера
   → получение профиля (id, email, name, avatar)
   → поиск auth_account по (provider, provider_user_id)
   → если нет — создание user + auth_account
   → если есть email — проверка привязки к существующему user
   → если новый user: trial_used_at = NOW(), subscription.status = trial
   → генерация access + refresh token
   → audit_log: login
   → если новый user: audit_log: trial_start
4. Сервер устанавливает refresh token в httpOnly cookie
5. Редирект на фронт: voronova.online/platform/auth-callback
   → Фронт вызывает POST /auth/refresh (cookie уже установлен)
   → Получает access token в теле ответа
   → Токены НИКОГДА не передаются через URL (query params / fragment)
```

### 5.5. Линковка аккаунтов (email ↔ VK ↔ Yandex)

Проблема: пользователь может войти через VK (без email), а позже попытаться войти по email. Без линковки — два разных user, дубль.

**Правила линковки при входе:**

```
1. Вход через OAuth (VK / Yandex):
   → Ищем auth_account по (provider, provider_user_id)
   → Найден → входим под существующим user
   → Не найден:
     → Провайдер вернул email?
       → Да → Ищем user по этому email
         → Найден → привязываем новый auth_account к существующему user
         → Не найден → создаём нового user + auth_account
       → Нет (VK без email) → создаём нового user + auth_account (email = NULL)

2. Вход по email:
   → Ищем auth_account по (provider='email', provider_user_id=email)
   → Найден → входим
   → Не найден:
     → Ищем user по users.email = этот email
       → Найден → создаём auth_account (provider='email') для этого user
       → Не найден → создаём нового user + auth_account

3. Ручная привязка email (пользователь VK без email добавляет почту в кабинете):
   → POST /me/link-email { email: 'user@mail.ru' }
     → Проверяем: этот email уже есть у другого user?
       → Да → ошибка «Этот email уже привязан к другому аккаунту»
       → Нет → отправляем код верификации на этот email
   → POST /me/verify-link-email { code }
     → Код верный → обновляем users.email, создаём auth_account (provider='email')
   → Привязка email — чувствительная операция, требует верификации через код.
     НЕ делается через PATCH /me
```

> Ключевой принцип: email — связующее звено. Если два провайдера возвращают один email, это один пользователь. Если VK не вернул email — пользователь изолирован до ручной привязки.

### 5.6. Rate limiting

| Endpoint | Лимит |
|----------|-------|
| POST /auth/send-code | 3 / email / час, 10 / IP / час |
| POST /auth/verify-code | 5 попыток на код, 20 / IP / час |
| POST /auth/refresh | 10 / IP / минуту |
| Все остальные | 100 / IP / минуту |

---

## 6. Логика подписки

### 6.1. Источник истины

**`subscriptions.status`** — единственное поле, определяющее доступ.

API проверяет только `status`. Никогда не вычисляет доступ из `paid_until` или `trial_ends` напрямую.

Ежедневный крон читает `paid_until` и `trial_ends` → обновляет `status`. Это единственное место, где даты влияют на статус.

### 6.2. Состояния

```
Регистрация → trial (7 дней)
                ↓
         Триал истёк?
          /        \
        Нет        Да
         |          ↓
      trial     expired ← ← ← ← ← ←
         |          ↓               ↑
         |    Оплатил?              |
         |     /      \             |
         |   Нет      Да           |
         |    |        ↓            |
         |    |     active          |
         |    |        ↓            |
         |    |   paid_until < NOW()?
         |    |    /          \     |
         |    |  Нет          Да ─ ─┘
         |    |   |
         |    | active
         ↓    ↓
      blocked (ручная блокировка админом)
      cancelled (пользователь сам отказался)
```

### 6.3. Доступ по статусу

| Статус | Что видит | Что может |
|--------|-----------|-----------|
| trial | Все рецепты в списке, заблокированные отмечены замком | Открыть N бесплатных рецептов (trial_recipe_limit, по умолчанию 5). Остальные — попап «Оформите подписку» |
| active | Всё | Полный доступ ко всем рецептам, конструктору тарелки, кабинету |
| expired | Главная с попапом «Подписка истекла» | Только страница оплаты и кабинет |
| cancelled | То же что expired | То же что expired |
| blocked | Экран «Доступ заблокирован» | Ничего |

> `trial_recipe_limit` — настраиваемый параметр, хранится в конфиге на сервере (не магическое число в коде).

### 6.4. Защита триала

Триал выдаётся один раз. Защита многоуровневая — каждый уровень обязателен для MVP.

**Уровень 1 — привязка к email (основной, блокирующий):**
- Триал выдаётся только если `users.trial_used_at IS NULL`
- При повторной регистрации с тем же email — сразу статус `expired`, без триала
- Соцлогин без email: VK без email получает триал. Если позже пользователь привяжет email (линковка, раздел 5.5) — аккаунты объединяются, `trial_used_at` уже заполнен, повторный триал невозможен

**Уровень 2 — fingerprint (антиабуз, не блокирующий):**
- При активации триала сохраняется fingerprint устройства в `subscriptions.fingerprint`
- При новой регистрации с другого email, но тем же fingerprint — триал **выдаётся** (не блокируется), но:
  - Событие логируется в audit_logs: `action = 'suspicious_trial'`, `details = { fingerprint, email, prev_email }`
  - В админке: раздел «Подозрительные триалы» — админ решает блокировать или нет
- Fingerprint — ненадёжная мера, пользователи могут обходить. Это сигнал для ручной проверки, не автоматическая блокировка

**Уровень 3 — rate limit на регистрации:**
- Не более 3 новых аккаунтов с одного IP в час
- Блокирующий — при превышении регистрация отклоняется

**Осознанные ограничения:**
- Пользователь может создать новый email + новое устройство и получить повторный триал. Это компромисс для MVP
- Масштабирование: привязка к номеру телефона (SMS-верификация) как более надёжная защита

### 6.5. Ежедневный крон (проверка подписок)

```
Каждый день в 00:05 MSK:

1. Истёкшие триалы:
   UPDATE subscriptions SET status = 'expired', updated_at = NOW()
   WHERE status = 'trial' AND trial_ends < NOW()
   → audit_log: subscription_expired (actor_id = NULL, system)
   → email: «Триал закончился, оформите подписку»

2. Истёкшие подписки:
   UPDATE subscriptions SET status = 'expired', updated_at = NOW()
   WHERE status = 'active' AND paid_until < NOW()
   → audit_log: subscription_expired (actor_id = NULL, system)
   → email: «Подписка истекла»

3. Очистка старых login_codes:
   DELETE FROM login_codes WHERE expires_at < NOW() - INTERVAL '1 day'

4. Запись результата:
   INSERT INTO cron_runs (job, status, affected_rows, finished_at)
   → Telegram-алерт если крон не записал результат к 00:30
```

### 6.6. Защита от сбоя крона (fallback)

Крон — единственный процесс, обновляющий status из дат. Если он не отработал, пользователь с истёкшей подпиской сохранит доступ. Меры:

**Мониторинг:**
- Таблица `cron_runs (id, job, status, affected_rows, error, finished_at)` — каждый запуск крона записывает результат
- Telegram-алерт: если за последние 25 часов нет записи в cron_runs для job = 'check_subscriptions'
- В дашборде админки: индикатор «Последний запуск крона: {время}» — красный если > 25 часов

**Fallback в API:**
- GET /me и GET /recipes/:id дополнительно проверяют: если `status = 'active'` и `paid_until < NOW()`, или `status = 'trial'` и `trial_ends < NOW()` — возвращают доступ как `expired` (без обновления БД)
- Это страховка на случай сбоя крона. Крон остаётся единственным процессом, который **пишет** status, но API **читает** с проверкой дат как fallback

---

## 7. API endpoints

### 7.1. Публичные (без авторизации)
```
POST   /auth/send-code          — отправить код на email
POST   /auth/verify-code        — проверить код, получить токены
GET    /auth/oauth/:provider    — редирект на VK / Yandex
GET    /auth/oauth/callback     — callback от провайдера
POST   /auth/refresh            — обновить access token (ротация refresh)
```

### 7.2. Авторизованные (требуют access token)
```
POST   /auth/logout             — отозвать refresh token
GET    /me                      — профиль + статус подписки
PATCH  /me                      — обновить имя, аватар (без email)
POST   /me/link-email           — привязка email (отправляет код → верификация → линковка)
POST   /me/verify-link-email    — подтверждение кода привязки email
GET    /me/sessions             — список активных сессий
DELETE /me/sessions/:id         — отозвать сессию
GET    /recipes                 — список (заблокированные с флагом locked: true)
GET    /recipes/:id             — полный рецепт (проверка доступа по status)
```

### 7.3. Админские (требуют access token + role = admin)
```
GET    /admin/users             — список пользователей с фильтрами
GET    /admin/users/:id         — детали пользователя
POST   /admin/users/:id/extend  — продлить подписку (amount, period_start, period_end)
POST   /admin/users/:id/block   — заблокировать
POST   /admin/users/:id/unblock — разблокировать
GET    /admin/payments          — история платежей
GET    /admin/audit             — audit log с фильтрами
POST   /admin/broadcast        — отправить рассылку (тема, текст)
GET    /admin/stats             — статистика: пользователи по статусам, конверсия триал→оплата, churn, MAU, выручка, последний запуск крона
```

---

## 8. Email-уведомления (MVP)

| # | Событие | Когда | Тема письма |
|---|---------|-------|-------------|
| 1 | Welcome | При регистрации | Добро пожаловать в Умную тарелку! |
| 2 | Код входа | При POST /auth/send-code | Ваш код для входа: XXXXXX |
| 3 | Триал истёк | В день истечения (крон) | Пробный период закончился |
| 4 | Подписка истекла | В день истечения (крон) | Подписка истекла |
| 5 | Оплата подтверждена | После подтверждения админом | Оплата получена, доступ продлён |

Отправка: Unisender SMTP API. Шаблоны в HTML с инлайн-стилями, брендированные.

> Отложено на после MVP: напоминание за 2-3 дня до конца триала/подписки, рассылка новостей/рецептов из админки.

---

## 9. Админ-панель

Отдельная страница `admin.voronova.online` (доступ только role = admin).

### Экраны:
1. **Дашборд** — карточки: всего пользователей, на триале, активных, истёкших, выручка за месяц
2. **Пользователи** — таблица с поиском, фильтр по статусу, кнопки: продлить / заблокировать
3. **Платежи** — история подтверждений
4. **Аудит** — лог действий с фильтром по пользователю и типу

> Отложено на после MVP: экран «Рассылка» (ручная отправка новостей из админки).

---

## 10. Интеграция с фронтендом

### 10.1. Что меняется
- Убрать localStorage-авторизацию (Auth объект в data-v2.js)
- Все запросы к API через `fetch('https://api.voronova.online/...')`
- Access token в памяти JS, refresh в httpOnly cookie
- На каждой странице: проверка токена → если нет/истёк → редирект на login

### 10.2. Заблокированный контент
- Карточки рецептов: замок поверх фото, клик → попап «Оформите подписку»
- `trial_recipe_limit` — количество бесплатных рецептов (настраивается на сервере, по умолчанию 5)
- Список доступных рецептов приходит с API (флаг `locked: true/false`)

---

## 11. Безопасность

- HTTPS everywhere (Let's Encrypt)
- CORS: только voronova.online
- Refresh token: httpOnly, secure, SameSite=Strict, ротация при каждом использовании
- Пароли отсутствуют (вход по коду / OAuth)
- Rate limiting на все auth-эндпоинты (раздел 5.5)
- SQL: параметризованные запросы (нет сырого SQL)
- Бэкапы: pg_dump → GPG → S3 в РФ, шифрование at rest
- Логи: все действия с подписками и платежами в audit_logs

---

## 12. Бэкапы

```
Ежедневно в 03:00 MSK:
1. pg_dump → gzip → шифрование GPG → upload в S3 (Timeweb, РФ)
2. Хранение: 30 последних бэкапов
3. Еженедельно (воскресенье): автоматическое восстановление в тестовую БД → проверка целостности
4. Алерт в Telegram если бэкап не прошёл или проверка восстановления упала
```

> S3-бакет содержит только зашифрованные дампы. Ключ GPG хранится отдельно от S3 (на VPS + у администратора).

---

## 13. Операционные правила

### 13.1. Подтверждение оплаты

**Процесс для пользователя:**
1. На странице «Оформить подписку» отображаются реквизиты карты + инструкция
2. Пользователь переводит оплату **с обязательным комментарием**: его email на платформе (или последние 4 цифры карты отправителя)
3. После перевода пользователь нажимает «Я оплатил» → форма с полями:
   - Сумма перевода
   - Дата перевода
   - Последние 4 цифры карты, с которой переводил
   - Комментарий (опционально)
4. Данные сохраняются в payments (status = pending)

**Процесс для администратора:**
1. В админке: раздел «Ожидают подтверждения» — список неподтверждённых платежей
2. Каждая запись содержит: имя пользователя, email, сумма, дата, последние 4 цифры карты
3. Администратор сверяет с банковской выпиской по сумме + дате + 4 цифрам карты
4. Нажимает «Подтвердить» → указывает period_start и period_end
5. Система: обновляет payments (status = 'confirmed', confirmed_by, confirmed_at, period_start, period_end), subscriptions.status = active, paid_until = period_end
6. audit_log: payment_confirmed (actor_id = admin, details: { amount, period, card_last4 })
7. Автоматическое письмо: «Оплата получена, доступ продлён до {дата}»
8. Целевое время реакции: до 24 часов в рабочие дни

> Структура таблицы payments — см. раздел 4.1.

### 13.2. Доступ к админ-панели
- Только пользователи с role = admin
- На старте: один администратор (владелец)
- Вход через ту же авторизацию (email/VK/Yandex) + проверка role

### 13.3. Проверка бэкапов
- Автоматическая: еженедельно (крон, воскресенье 04:00)
- Ручная: раз в месяц администратор проверяет восстановление на локальной машине
- Алерт: Telegram-бот отправляет сообщение если бэкап/восстановление не прошло

### 13.4. Реакция на проблемы пользователей
- Пользователь пишет «я заплатил, доступа нет» → проверить payments + subscriptions, продлить вручную
- Пользователь пишет «не приходит код» → проверить login_codes + логи Unisender, предложить вход через VK/Yandex
- Пользователь просит удалить аккаунт → удалить из users (CASCADE удалит всё связанное), подтвердить по email

---

## 14. Метрики MVP

### 14.1. Ключевые метрики (отслеживать с первого дня)

| Метрика | Как считать | Где смотреть |
|---------|-------------|-------------|
| Регистрации | COUNT users WHERE created_at в периоде | Дашборд админки |
| Активация триала | COUNT audit_logs WHERE action = 'trial_start' AND created_at в периоде (исторические события, не текущий статус) | Дашборд |
| Конверсия триал → оплата | (COUNT payments WHERE confirmed_at в периоде AND user ранее был trial) / (COUNT subscriptions WHERE trial_ends в периоде) × 100% | Дашборд |
| Churn (отток) | (COUNT subscriptions WHERE status стал expired в периоде) / (COUNT subscriptions WHERE status = active на начало периода) × 100% | Дашборд |
| MAU | Уникальные user_id в audit_logs WHERE action IN ('login', 'recipe_view', 'plate_add') за 30 дней. Логировать recipe_view и plate_add как действия, чтобы учитывать пользователей с живой refresh-сессией | Дашборд |
| Выручка | SUM payments.amount WHERE status = 'confirmed' AND confirmed_at в периоде | Дашборд |

### 14.2. Целевые значения (ориентиры)

| Метрика | Цель на первые 3 месяца |
|---------|------------------------|
| Конверсия триал → оплата | > 5% |
| Churn | < 15% / мес |
| MAU / всего зарег. | > 30% |

> Если конверсия < 3% через 2 месяца — пересмотреть продукт или ценообразование, а не архитектуру.

---

## 15. Что отложено (не MVP)

| Фича | Когда добавлять |
|------|----------------|
| Google OAuth | После запуска, по запросу пользователей |
| Apple Sign-In | Только если iOS-приложение |
| Автоматические платежи (ЮKassa / Тинькофф) | При 50+ платящих |
| Реферальная программа | При стабильном потоке пользователей |
| Telegram-бот для оплаты | Параллельно с ростом |
| Уровни доступа (Базовый / Премиум) | При расширении контента |
| Telegram Mini App | Отдельный проект |
| Email-напоминания за 2-3 дня до истечения | Сразу после MVP |
| Рассылка новостей из админки | Сразу после MVP |

---

## 16. Эксплуатационные риски (учесть при реализации)

| # | Риск | Что сделать |
|---|------|-------------|
| 1 | payments.status = 'rejected' описан в схеме, но путь отклонения платежа не детализирован в операционном сценарии | При реализации админки: кнопка «Отклонить» рядом с «Подтвердить», запись в audit_log, уведомление пользователю с причиной |
| 2 | recipe_view и plate_add нужны для MAU, но если их не залогировать в коде фронта/API — метрика будет считать только логины | При реализации GET /recipes/:id и POST на добавление в тарелку — писать в audit_logs. Без этого MAU занижен |
| 3 | SQL-формулы дашборда (конверсия, churn) могут давать неверные цифры на граничных случаях | Перед запуском: прогнать все SQL на тестовых данных с известными ожидаемыми результатами |

---

## 17. Этапы реализации

### Этап 1. Инфраструктура
- [ ] Арендовать VPS Timeweb Cloud (2 CPU / 4 GB, Москва)
- [ ] Настроить DNS: api.voronova.online → VPS
- [ ] Установить: Ubuntu 22.04, Nginx, Node.js 20 LTS, PostgreSQL 16
- [ ] SSL через Let's Encrypt (certbot)
- [ ] Настроить S3-бакет для бэкапов (Timeweb, шифрование at rest)
- [ ] Настроить cron: pg_dump → GPG → S3
- [ ] Настроить алерт в Telegram при сбое бэкапа

### Этап 2. База данных + API авторизации
- [ ] Создать все таблицы, индексы, ограничения
- [ ] Реализовать POST /auth/send-code + /auth/verify-code
- [ ] Реализовать POST /auth/refresh с ротацией refresh token
- [ ] Реализовать POST /auth/logout
- [ ] Подключить VK ID OAuth
- [ ] Подключить Yandex ID OAuth
- [ ] Rate limiting (fastify-rate-limit)
- [ ] audit_logs на все auth-действия

### Этап 3. Подписки
- [ ] Логика триала (7 дней, один на email, trial_used_at)
- [ ] Ежедневный крон проверки подписок (00:05 MSK)
- [ ] GET /me с полным статусом подписки
- [ ] GET /recipes/:id с проверкой доступа по status

### Этап 4. Админ-панель
- [ ] Управление пользователями (продление, блокировка)
- [ ] Подтверждение платежей (список pending, сверка по card_last4 + сумме)
- [ ] Лог аудита
- [ ] Дашборд с метриками:
  - [ ] SQL-запрос: всего пользователей, по статусам (trial/active/expired/blocked)
  - [ ] SQL-запрос: конверсия триал → оплата за период
  - [ ] SQL-запрос: churn (expired за месяц / active на начало)
  - [ ] SQL-запрос: MAU (уникальные user_id в audit_logs WHERE action IN ('login','recipe_view','plate_add') за 30 дней)
  - [ ] SQL-запрос: выручка за период (SUM payments WHERE confirmed)
  - [ ] Индикатор последнего запуска крона

### Этап 5. Email-уведомления
- [ ] Подключить Unisender SMTP
- [ ] 5 шаблонов писем (welcome, код, триал истёк, подписка истекла, оплата подтверждена)
- [ ] Триггеры отправки в коде (регистрация, крон, подтверждение)

### Этап 6. Интеграция с фронтендом
- [ ] Новая страница login.html (email + VK + Yandex)
- [ ] Замена localStorage-авторизации на JWT
- [ ] Замки на заблокированных рецептах
- [ ] Попап «Оформите подписку»
- [ ] Обновление cabinet.html (реальные данные из API)

### Этап 7. Тестирование и запуск
- [ ] Тестирование всех потоков авторизации
- [ ] Тестирование триала и истечения подписки
- [ ] Тестирование бэкапа и восстановления
- [ ] Нагрузочное тестирование (базовое)
- [ ] Запуск

---

## 18. Стоимость (ежемесячная)

### На старте (0-100 пользователей)
| Статья | Сумма |
|--------|-------|
| VPS 2 CPU / 4 GB | 1 200 руб |
| Публичный IP | 180 руб |
| S3 бэкапы | 50-100 руб |
| Unisender | 0 (бесплатно до 1 500) |
| SSL | 0 |
| **Итого** | **~1 500 руб/мес** |

### При росте (100-500 пользователей)
| Статья | Сумма |
|--------|-------|
| VPS помощнее | 2 000-3 000 руб |
| Managed PostgreSQL | 790 руб |
| S3 | 100-300 руб |
| Unisender платный | 500-1 500 руб |
| **Итого** | **~3 500 - 5 500 руб/мес** |
