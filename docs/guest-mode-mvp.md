# Гостевой режим платформы — ТЗ

**Статус:** черновик, на обсуждение
**Автор:** Михаил + Claude
**Дата:** 2026-05-11
**Цель документа:** описать что и как меняется, чтобы незарегистрированный пользователь мог зайти на `plate.voronova.online` и увидеть каталог рецептов с понятной ценностью продукта.

---

## 1. Проблема

Сейчас вся платформа закрыта login wall'ом:
- На любой странице `platform/*.html` первой строкой выполняется `Auth.requireAuth()` → редирект на `login.html`.
- Гость видит только форму ввода email и **не понимает за что регистрируется**.
- Каталог из 55 рецептов и 4 категорий не индексируется поисковиками, не делится в соцсетях, не работает на конверсию.

Это слабое место для первого продукта: воронка регистрации оптимизируется вслепую — мы видим только тех, кто всё-таки зарегистрировался, но не видим, сколько ушло с login wall.

---

## 2. Цели

1. **Дать гостю увидеть масштаб контента** — каталог, категории, счётчики, превью рецептов.
2. **Открыть «дегустацию»** — 3-10 рецептов целиком, без регистрации.
3. **Сделать регистрацию осознанным шагом**, а не платой за вход.
4. **Открыть SEO-индексацию** каталога и рецептов.
5. **Сохранить монетизацию** — конструктор «Моя тарелка», сохранения, заметки, новые рецепты остаются за регистрацией/подпиской.

---

## 3. Не-цели (out of scope)

- Не убираем подписку и paywall на платные рецепты.
- Не открываем гостю функциональность «Моя тарелка» (КБЖУ-конструктор).
- Не открываем избранное, заметки, оценки/отзывы для гостя — это драйверы регистрации.
- Не делаем редизайн.
- Не делаем отдельную «гостевую категорию». Уровень доступа — отдельная ось `access_level` (§5A), категория описывает только *тип блюда*.

---

## 4. Что уже готово (важно)

Бэкенд **уже поддерживает гостевой режим**. Менять API почти не надо:

| Эндпоинт | Гостевой доступ | Поведение |
|---|---|---|
| `GET /content/recipes` | ✅ через `optionalAuthenticate` | Для платных рецептов режет `ingredients`, `steps`, `note`. Free-рецепты отдаёт полностью. |
| `GET /content/categories` | ✅ публичный | Возвращает категории + ID рецептов |
| `GET /content/news` | ✅ публичный | Лента новостей и анонсов |
| `GET /content/ratings` | ✅ публичный | Средние оценки по всем рецептам |
| `GET /content/reviews/:recipeId` | ✅ публичный | Отзывы на рецепт |
| `GET /content/stats` | ✅ публичный | Кол-во опубликованных рецептов |

Источник: [server/src/routes/content.js:38-68](server/src/routes/content.js#L38-L68)

Логика «trial видит только free» уже реализована на фронте:
```js
const locked = Auth.isTrial() && !d.free;  // category.html:361
canViewRecipe(recipe) { return recipe.free || this.hasFullAccess(); }  // data-v2.js:194
```

То есть **новый уровень доступа = распространить эту же логику на гостя**.

---

## 5. Модель доступа: две оси

**Категория ≠ уровень доступа.** Это две независимых оси:

- **Категория рецепта** — это про *тип блюда* (`breakfasts`, `soups`, `mains`, `salads`, `spreads`, `sauces`, `drinks`, ...). `mains` отображается как «Горячее».
- **`access_level` рецепта** — это про *кому доступен рецепт*. Новое поле, три значения:
  - `free` — доступен **гостю** без регистрации (витрина).
  - `trial` — доступен зарегистрированному пользователю на пробном периоде и Pro.
  - `pro` — доступен только активной Pro-подписке (+admin).

### 5.1. Матрица доступа (пользователь × рецепт)

| Пользователь | `free` | `trial` | `pro` |
|---|---|---|---|
| **Guest** (не залогинен) | ✅ полностью | 🔒 preview + CTA «Войти и получить 7 дней» | 🔒 preview + CTA «Войти и получить 7 дней» |
| **Trial** (активный пробный) | ✅ | ✅ | 🔒 preview + CTA «Оформить Pro» |
| **Active / Pro** | ✅ | ✅ | ✅ |
| **Admin** | ✅ | ✅ | ✅ |
| **Expired / no_sub** | ✅ | 🔒 → продлить | 🔒 → продлить |

### 5.2. Матрица возможностей (что может делать пользователь, кроме просмотра рецептов)

| Действие | Guest | Trial | Active | Admin |
|---|---|---|---|---|
| Видеть каталог + счётчики | ✅ | ✅ | ✅ | ✅ |
| Избранное, заметки | ❌ → CTA login | ✅ | ✅ | ✅ |
| Конструктор «Моя тарелка» | ❌ → CTA login | ✅ | ✅ | ✅ |
| Оценки / отзывы | ❌ → CTA login | ✅ | ✅ | ✅ |
| Кабинет / админка | ❌ → CTA login | ✅ | ✅ | ✅ |

Подробности технической реализации модели — в §5A.

---

## 5A. Реализация модели `access_level`

### 5A.1. Схема БД

Реализация: [server/migrate-access-level.sql](server/migrate-access-level.sql).

Принципы:
- Колонка `access_level TEXT NOT NULL DEFAULT 'pro'`.
- CHECK constraint на `('free','trial','pro')`.
- Индекс `idx_recipes_access_level`.
- **Идемпотентность через DO-блок:** backfill из `is_free` выполняется ТОЛЬКО при первом создании колонки. Это критично — иначе повторный запуск миграции откатил бы вручную выставленные админом `access_level='pro'` обратно в `'trial'`.
- **Страховочные шаги после DO-блока:** на случай если кто-то создал колонку вручную раньше без `NOT NULL` / `DEFAULT` / без backfill. Все три шага идемпотентны и не трогают уже выставленные значения.

Псевдокод:
```sql
-- (1) Создание + first-time backfill
DO $$
DECLARE col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (... information_schema.columns WHERE column_name='access_level' ...) INTO col_exists;
  IF NOT col_exists THEN
    ALTER TABLE recipes ADD COLUMN access_level TEXT NOT NULL DEFAULT 'pro';
    UPDATE recipes SET access_level = CASE WHEN is_free THEN 'free' ELSE 'trial' END;
  END IF;
END $$;

-- (2) Defensive: dofiks для уже существующей колонки без полных констрейнтов.
ALTER TABLE recipes ALTER COLUMN access_level SET DEFAULT 'pro';
UPDATE recipes SET access_level = CASE WHEN is_free THEN 'free' ELSE 'trial' END
  WHERE access_level IS NULL;
ALTER TABLE recipes ALTER COLUMN access_level SET NOT NULL;

-- (3) CHECK и INDEX — идемпотентно через DROP IF EXISTS / IF NOT EXISTS.
```

**Дефолт `'pro'` для новых рецептов выбран намеренно** — самая закрытая опция, чтобы не было «утечки» доступа из-за забытого поля при создании.

**Финальное распределение `trial` vs `pro`** между существующими рецептами — продуктовое решение Юлии (см. §7). На момент миграции все не-free попадают в `trial`. Pro-рецепты потом расставляются вручную в админке.

### 5A.2. `is_free` — оставляем как legacy mirror

- Колонку `is_free` не удаляем.
- Источник истины — `access_level`.
- При записи через API: `is_free = (access_level === 'free')` — автоматическая синхронизация.
- При чтении: фронт читает `access_level`, fallback на `is_free`.

Это даёт чистый rollback-путь, если что-то пойдёт не так на этапе релиза.

### 5A.3. API stripping (`/content/recipes`)

Сейчас [server/src/routes/content.js:38-68](server/src/routes/content.js#L38-L68) режет `ingredients/steps/note` по правилу «есть подписка или free». Переписать на правило по `access_level`:

```js
function userCanSeeRecipe(userTier, accessLevel) {
  if (accessLevel === 'free') return true;
  if (accessLevel === 'trial') return userTier === 'trial' || userTier === 'active' || userTier === 'admin';
  if (accessLevel === 'pro')   return userTier === 'active' || userTier === 'admin';
  return false;  // unknown level → закрыто
}
```

где `userTier` определяется:
- нет токена / нет user → `'guest'`
- admin → `'admin'`
- подписка `trial` (не истекла) → `'trial'`
- подписка `active` (не истекла) → `'active'`
- всё остальное (expired / cancelled / blocked / no_sub) → `'guest'`

Если `userCanSeeRecipe()` → `false`, режем `ingredients`, `steps`, `note` (то же что сейчас).

**Критично:** stripping остаётся **на сервере**. Фронт нельзя считать источником правды для доступа — только UI-подсказкой.

### 5A.4. Frontend: маппинг и хелперы

В [platform/data-v2.js](platform/data-v2.js) `_mapRecipe()`:

```js
accessLevel: r.access_level || (r.is_free ? 'free' : 'pro'),
free: r.access_level ? (r.access_level === 'free') : !!r.is_free,
```

`Auth.canViewRecipe(recipe)` — обновить под три уровня:

```js
canViewRecipe(recipe) {
  const level = recipe.accessLevel || (recipe.free ? 'free' : 'pro');
  if (level === 'free') return true;
  if (level === 'trial') return this.isTrial() || this.hasFullAccess();
  if (level === 'pro')   return this.hasFullAccess();
  return false;
},
```

Добавить вспомогательный хелпер для CTA (используется в тостах и preview-блоке):

```js
recipePaywallCta(recipe) {
  const level = recipe.accessLevel || (recipe.free ? 'free' : 'pro');
  // Уже доступен — CTA не нужен
  if (this.canViewRecipe(recipe)) return null;

  // Guest → login с return
  if (this.isGuest()) {
    return {
      title: level === 'pro' ? 'Этот рецепт открыт для подписчиков Pro' : 'Этот рецепт открыт после регистрации',
      btn: 'Войти и получить 7 дней бесплатно',
      href: this._loginUrl()
    };
  }
  // Trial → pro CTA
  if (this.isTrial() && level === 'pro') {
    return {
      title: 'Этот рецепт доступен по подписке Pro',
      btn: 'Оформить Pro',
      href: 'cabinet.html?tab=subscription&return=' + encodeURIComponent(this._currentReturnUrl() || '')
    };
  }
  // Expired / no_sub → продлить
  return {
    title: 'Доступ к рецептам ограничен',
    btn: 'Продлить подписку',
    href: 'cabinet.html?tab=subscription&return=' + encodeURIComponent(this._currentReturnUrl() || '')
  };
},

recipeAccessLabel(recipe) {
  const level = recipe.accessLevel || (recipe.free ? 'free' : 'pro');
  if (level === 'free')  return 'Бесплатно';
  if (level === 'trial') return 'Trial';
  return 'Pro';
},
```

### 5A.5. Frontend: locked-формула на карточках

Замена прежней формулы:

```js
const locked = !Auth.canViewRecipe(d);
```

Бейджи на карточках:
- `free` — бейдж «Бесплатно» (зелёный)
- `trial` + пользователь без доступа — бейдж «Trial» (жёлтый)
- `pro` + пользователь без доступа — бейдж «Pro» (оранжевый/премиум)
- Если у пользователя есть доступ — бейдж можно не показывать (или показывать ненавязчиво).

### 5A.6. Admin / recipe-editor — селектор уровня

В [platform/recipe-editor.html:1246](platform/recipe-editor.html#L1246) заменить чекбокс «Trial» (= `is_free`) на **select / radio** уровня доступа:

```html
<label class="re-field-label">Уровень доступа</label>
<select id="re-access-level">
  <option value="pro">Pro — только подписчики</option>
  <option value="trial">Trial — пробный период и Pro</option>
  <option value="free">Free — доступен гостям</option>
</select>
```

При сохранении POST/PUT отправлять `access_level`. `is_free` сервер выставит автоматически (mirror).

### 5A.7. Backend writes — валидация и синхронизация полей

В `POST /admin/recipes` и `PUT /admin/recipes/:id`:
- Принять `access_level`. Валидируется **до DB-запросов** через `normalizeAccessLevel(body)`.
- **Если `access_level` отсутствует** (undefined / null / '') — fallback на `is_free`:
  - `is_free === true` → `'free'`
  - иначе → `'trial'` (не `'pro'`! Не хотим перевести в pro незаметно).
- **Если `access_level` передан и валиден** → используем.
- **Если `access_level` передан, но не входит в `['free','trial','pro']`** → `400 { error, field: 'access_level' }`. Никакого silent fallback на is_free — это опасно, админ должен видеть свою ошибку.
- Mirror: `is_free = (access_level === 'free')` — сервер пишет это поле сам, не доверяя клиенту.

### 5A.8. Тесты

Интеграционные тесты в [server/__tests__/content.test.mjs](server/__tests__/content.test.mjs):

**Stripping-матрица для `GET /content/recipes`:**

| Сценарий | `access_level=free` | `access_level=trial` | `access_level=pro` |
|---|---|---|---|
| Guest (нет токена) | full | stripped | stripped |
| Trial user | full | full | stripped |
| Active user | full | full | full |
| Admin | full | full | full |
| Expired / blocked | full | stripped | stripped |

Утверждения: для «stripped» в ответе **нет** ключей `ingredients`, `steps`, `note`. Для «full» все три есть.

**Дополнительные сценарии:**
- Legacy-рецепт с `is_free=false` и без `access_level` → fallback на `'pro'` (закрыто для guest и trial).
- `POST /admin/recipes` с `access_level: 'invalid_value'` → `400 { field: 'access_level' }`.
- `PUT /admin/recipes/:id` с невалидным `access_level` → `400`.
- `POST /admin/recipes` без поля `access_level` (legacy: только `is_free`) → НЕ 400, валидация проходит.

### 6.1. Фронтенд — снять `requireAuth()` с публичных страниц

| Файл | Сейчас | Должно стать |
|---|---|---|
| `platform/index.html:843` | `Auth.requireAuth()` → редирект на login | Не редиректить. Если гость — рендерить шапку с кнопкой «Войти», грузить каталог, не вызывать `checkAccess()`. |
| `platform/category.html:184` | `Auth.requireAuth()` | То же. |
| `platform/recipe.html:659` | `Auth.requireAuth()` | То же. Если рецепт `free` или `hasFullAccess()` → показывать целиком. Иначе → превью (название, фото, цитата, КБЖУ, время, сложность) + CTA «Зарегистрируйтесь, чтобы увидеть рецепт целиком». |

Страницы, **которые остаются за логином** (не трогаем):
- `cabinet.html` — личный кабинет
- `admin.html` / `admin-*.html` — админка
- `recipe-editor.html` — редактор рецептов

### 6.2. Поведение `Auth.checkAccess()` для гостя

**⚠️ НЕ менять `checkAccess()` глобально так, чтобы гость всегда получал `_subStatus='guest'`.**
Это может случайно ослабить защиту `cabinet.html` / `admin.html` / `recipe-editor.html` — страницы, которые сейчас полагаются на то, что без логина их вообще не открыть.

Безопасный вариант — добавить опциональный флаг:

```js
Auth.checkAccess({ allowGuest: true })
```

**Поведение:**
- Если `allowGuest === true` и пользователь **не залогинен**:
  - `Auth._subStatus = 'guest'`
  - НЕ редиректить на login
  - НЕ показывать paywall overlay
  - Возвращать `false` (или специальное значение типа `'guest'`), но страница продолжает рендериться.
- Если `allowGuest` не передан / `false`:
  - Старое поведение сохраняется без изменений.
  - Незалогиненный пользователь редиректится на login.html.

**Использовать `allowGuest: true` только на публичных страницах:**
- `platform/index.html`
- `platform/category.html`
- `platform/recipe.html`

**НЕ использовать `allowGuest` на:**
- `platform/cabinet.html`
- `platform/admin.html` (и все `admin-*.html`)
- `platform/recipe-editor.html`

Для гостя `hasFullAccess()` → `false`, `isTrial()` → `false`. Это автоматически активирует уже существующую логику «locked для платных рецептов».

### 6.3. UI-изменения

**Шапка (header):**
- Если гость — вместо профильной пилюли (`#user-badge`) показать кнопку «Войти» / «Регистрация», ведущую на `login.html?return=<current_url>`.
- Иконка тарелки (`vh-plate-btn`) — для гостя ведёт не в модал тарелки, а на регистрацию с пояснением «Войдите, чтобы пользоваться конструктором».

**Карточки рецептов (`buildDishCard()`):**

Логика `locked` сейчас:
```js
const locked = Auth.isTrial() && !d.free;
```
Меняется на:
```js
const locked = !Auth.canViewRecipe(d);
```

Хелпер `canViewRecipe()` инкапсулирует все правила по `access_level` (см. §5A.4). Это даёт чистую таблицу истинности (§5.1).

Бейджи (через `Auth.recipeAccessLabel(recipe)`, см. §5A.4):
- `free` → бейдж «Бесплатно» (зелёный).
- `trial` + пользователь без доступа → бейдж «Trial» (жёлтый).
- `pro` + пользователь без доступа → бейдж «Pro» (премиум-оранжевый).
- Если доступ есть — бейдж можно опустить (или показывать ненавязчиво).

**Тост-сообщение при клике на залоченный рецепт.**
Сейчас `showLockedMsg()` всегда ведёт на `cabinet.html`. Новый вариант берёт CTA из `Auth.recipePaywallCta(recipe)` — title, btn и href зависят от связки «уровень пользователя × access_level рецепта»:

| Пользователь | Рецепт `trial` | Рецепт `pro` |
|---|---|---|
| Guest | Войти и получить 7 дней | Войти и получить 7 дней |
| Trial | — (доступ есть) | Оформить Pro |
| Expired/no_sub | Продлить подписку | Продлить подписку |

**Кнопка «избранное» (`recipe-card__bookmark`):**
Сейчас скрывается на locked-карточках. Для гостя на **free**-карточках кнопка видна, но клик ведёт на login с `return=`.

**FAB-кнопка чата (Tawk.to):**
Оставить — это публичный сервис, гость должен иметь возможность задать вопрос.

### 6.4. Страница рецепта (`recipe.html`)

Если `Auth.canViewRecipe(recipe)` → полный рендер как сейчас.

Если **нет** доступа — обязательно отдельный preview-state. Не допускать ситуацию «пустой рецепт без `ingredients/steps`» — это плохой UX и выглядит как баг.

**Preview-state гостя показывает:**
- Фото, название, КБЖУ, время и цитату (`quote`).
- Первые 3 ингредиента без количеств и текст первого шага без фотографий шагов.
- Общее количество ингредиентов и шагов, остальные позиции визуально закрыты.

Для `trial`-рецепта CTA предлагает регистрацию и 7 дней доступа. Для `pro`-рецепта тот же подробный preview сопровождается ценой и CTA подписки. Содержимое CTA берётся из `Auth.recipePaywallCta(recipe)`:

| Пользователь × Рецепт | CTA-заголовок | Кнопка | href |
|---|---|---|---|
| Guest × trial | «Этот рецепт открыт после регистрации» | «Войти и получить 7 дней бесплатно» | `login.html?return=...` |
| Guest × pro | «Этот рецепт открыт для подписчиков Pro» | «Войти и получить 7 дней бесплатно» | `login.html?return=...` |
| Trial × pro | «Этот рецепт доступен по подписке Pro» | «Оформить Pro» | `cabinet.html?tab=subscription&return=...` |
| Expired/no_sub × trial/pro | «Доступ к рецептам ограничен» | «Продлить подписку» | `cabinet.html?tab=subscription&return=...` |

Кнопки «оценить», «оставить отзыв», «в избранное», «в тарелку» **не должны работать напрямую**. Любой клик у пользователя без доступа ведёт по соответствующему CTA-href (для гостя — login, для trial → pro — cabinet).

API не отдаёт гостю полные `ingredients/steps/note`: для `trial` и `pro` доступны только отдельные поля безопасного preview (`preview_ingredients`, `preview_steps`, счётчики). Остальным пользователям без доступа выдаётся прежний stripped-ответ.

**Проверка реализации:** перед мержем убедиться, что в DOM **нет** пустых блоков `.recipe-ingredients`, `.recipe-steps`, `.recipe-note` — должен быть **один** CTA-блок вместо них.

### 6.5. SEO — этап 2, НЕ смешивать с этапом 1

SEO выносим в отдельный этап, чтобы этап 1 проверял **одну гипотезу** (гости смотрят каталог), а не «всё сразу».

Состав этапа 2:
- Динамический `<title>` для `category.html` и `recipe.html` — название категории/рецепта.
- `<meta name="description">` — короткое описание (для рецепта = `quote` или первые 160 символов).
- `<meta property="og:image">` — фото рецепта (для Telegram-превью, ВК, etc.).
- `<link rel="canonical">` — на конкретный URL рецепта.
- `robots.txt` на `plate.voronova.online` — разрешить индексацию каталога, запретить `cabinet.html`, `admin*`, `login.html`.
- `sitemap.xml` — список всех публичных рецептов и категорий.
- Структурированные данные `Recipe` (schema.org JSON-LD) — опционально, но даст rich snippets в Google.

### 6.6. Аналитика

Добавить три отдельных события:
- `guest_visit` — гость зашёл на платформу (один раз за сессию)
- `guest_recipe_view` — гость открыл рецепт (с указанием `recipe_id` и `is_free`)
- `guest_locked_click` — гость кликнул на залоченный контент

Это даст полную картину верхней воронки.

### 6.6.2. Все персональные действия гостя → login с `return=`

Любой клик гостя по персональной функции ведёт на `login.html?return=<current_url>`:
- избранное (bookmark на карточке, кнопка на recipe.html);
- «Моя тарелка» (иконка в шапке, кнопка «в тарелку» в рецепте);
- оценки (звёзды);
- отзывы (форма комментариев);
- личный кабинет (если гость кликнул на «Войти»);
- сохранение истории.

Никаких локальных fallback'ов «попробуйте без регистрации» в этапе 1 — см. §6.9.

### 6.7. Бэкенд — что меняем в этапе 1

С добавлением `access_level` (§5A) бэкенд **меняется**:

1. **Миграция БД** — `server/migrate-access-level.sql`:
   - `ALTER TABLE recipes ADD COLUMN access_level TEXT NOT NULL DEFAULT 'pro';`
   - CHECK constraint на `('free','trial','pro')`.
   - Backfill из `is_free` (free → free, остальные → trial).
2. **`GET /content/recipes`** ([server/src/routes/content.js:38](server/src/routes/content.js#L38)) — заменить stripping на матрицу из §5A.3.
3. **`POST /admin/recipes` / `PUT /admin/recipes/:id`** — принять и валидировать `access_level`, mirror в `is_free` (§5A.7).
4. **`GET /admin/recipes`** — отдавать `access_level` в ответе.
5. **Тесты `server/__tests__/content.test.mjs`** — добавить сценарии stripping по уровням (§5A.8).

**Что НЕ трогаем:**
- `/content/categories`, `/content/news`, `/content/ratings`, `/content/reviews/:recipeId`, `/content/stats` — уже публичные, остаются как есть.
- `POST /content/reviews` — остаётся `authenticate` (гость отзыв не оставит).
- CORS, rate-limit — без изменений.

**Если обнаружится утечка платных полей** (например, гость как-то получает `ingredients`/`steps`/`note` `pro`-рецепта) — **остановиться, не маскировать на фронте, показать проблему**. Это безопасностная регрессия и её надо чинить на сервере, а не клиентским скрытием.

### 6.8. Бэкенд — что **возможно** меняем (под вопросом, не в этапе 1)

- **Rate-limit для гостевых запросов.** Сейчас лимит 100 req/min на IP — этого должно хватить. Если будет всплеск, можно сделать отдельный лимит для `optionalAuthenticate` без `req.user`. **Решение:** оставляем как есть, мониторим.
- **Расширить `/content/recipes`** — реализовано: гостю отдаются 3 названия ингредиентов без количеств и текст первого шага у `trial`/`pro`; полный состав, точные количества, остальные шаги, заметка и фотографии шагов остаются закрыты.

### 6.9. Локальная «Моя тарелка» для гостя — НЕ в этапе 1

Раньше рассматривалось как опция этапа 1. **Откладываем в отдельный этап 1.5.**

**Причина:** гостевая тарелка сильно увеличивает объём работ — localStorage-хранение, перенос на серверный аккаунт после логина, edge-cases с платными рецептами в тарелке (что показывать после логина?), отдельная логика «сохранить в историю». Сначала проверяем простую гипотезу: **смотрят ли гости каталог вообще**. Если да — можно вкладывать в гостевую тарелку.

В этапе 1 гость, кликая по «Моя тарелка» или «в тарелку», получает CTA «Войти, чтобы пользоваться конструктором».

---

## 7. Распределение рецептов по уровням доступа

После миграции (§5A.1) все рецепты автоматически попадают в `free` (3 шт.) или `trial` (52 шт.). `pro` — пустой.

**Целевое распределение** (продуктовое решение Юлии):

| Уровень | Сколько | Назначение | Критерии отбора |
|---|---|---|---|
| `free` | 5-10 | Витрина для гостей | Разные категории (по 1-2 из ключевых: завтраки, основные, салаты, намазки/соусы), красивые фото, понятный результат, не самые сложные |
| `trial` | 30-45 | Основная база | Большая часть рецептов — даёт реальную ценность пробного периода |
| `pro` | 5-15 | Премиум-набор | Самые ценные/новые/премиальные рецепты + все будущие новинки |

**Важно:** `trial` **не должен** открывать вообще всё, иначе часть пользователей съест базу за 7 дней и не оплатит. Минимум 5-10 рецептов должно быть в `pro`, иначе оплата не имеет смысла.

**Сейчас в БД:** 3 free, 52 не-free. После миграции: 3 free, 52 trial, 0 pro. Юлия должна выбрать:
1. Дополнительные `free`-рецепты (до 5-10 шт.).
2. `pro`-рецепты (5-15 шт.) — переводим из trial.

Можно сделать постепенно — миграция запускает MVP-распределение, Юлия дотюнивает через админку.

---

## 8. Поэтапный план релиза

### Этап 1a — backend (миграция + access_level)
1. Написать `server/migrate-access-level.sql` — ALTER + CHECK + backfill.
2. Применить миграцию на VPS.
3. Обновить [server/src/routes/content.js](server/src/routes/content.js): новая stripping-логика по `access_level` (§5A.3), приём `access_level` в admin write-эндпоинтах (§5A.7).
4. Добавить тесты в `server/__tests__/content.test.mjs` (§5A.8).
5. Деплой API (`pm2 restart smartplate-api`).
6. **Проверка:** старый фронт продолжает работать (он шлёт `is_free`, сервер mirror-ит в `access_level`). Никаких визуальных изменений у пользователей.

### Этап 1b — frontend (гостевой режим + новая модель)
1. `Auth.checkAccess({ allowGuest: true })` (§6.2) — уже сделано.
2. `data-v2.js`: `_mapRecipe()` читает `access_level`, добавить `canViewRecipe`, `recipePaywallCta`, `recipeAccessLabel` (§5A.4).
3. `index.html`, `category.html`, `recipe.html` — заменить `requireAuth()` на `checkAccess({ allowGuest: true })`, заменить formula `locked`, адаптировать шапку и preview-state.
4. Стили бейджей и preview-блока в `style-v4.css`.
5. `recipe-editor.html` — заменить чекбокс «Trial» на селектор `access_level` (§5A.6).
6. На `cabinet.html`, `admin.html`, остальных `admin-*.html` — **НЕ трогать**.
7. Smoke-тест (§10).

### Этап 1.5 — локальная «Моя тарелка» для гостя (опционально)
Только если этап 1 показал, что гости реально смотрят каталог.
- localStorage-хранение items без сервера.
- Перенос тарелки на серверный аккаунт после логина/регистрации.

### Этап 2 — SEO + аналитика
1. Динамические `<title>` / `<meta description>` / `og:image`.
2. `robots.txt` и `sitemap.xml` на `plate.voronova.online`.
3. JSON-LD Recipe schema (опционально).
4. События `guest_visit` / `guest_recipe_view` / `guest_locked_click`.

### Этап 3 — продуктовое распределение
- Юлия определяет 5-10 free-рецептов + 5-15 pro-рецептов через админку.
- Опционально: спец-блок «Попробуйте бесплатно» на главной для гостя.

**Порядок запуска в проде:** 1a → 1b → 3 → 2. После 1a в админке появится возможность размечать pro-рецепты, Юлия может начать готовить распределение параллельно с разработкой 1b.

---

## 9. Риски

| Риск | Вероятность | Митигация |
|---|---|---|
| Падение конверсии в подписку (гость доволен 5-10 рецептами, не платит) | средняя | Делать free-рецепты «вкусной демонстрацией», но не «полным базовым набором». Ценность платных = регулярные новинки + конструктор + сохранения. |
| Скрейпинг каталога конкурентами | низкая | Rate-limit, в крайнем случае — Cloudflare. Контент = название/КБЖУ/превью, не сами шаги (для платных). Free-рецепты — публичные и так должны быть. |
| Нагрузка на API от индексирующих ботов | низкая | Уже стоит helmet + rate limit. Sitemap.xml позволит ботам не долбить случайно. |
| Гость путается, что доступно а что нет | средняя | Чёткие бейджи «Бесплатно» / «Pro» на карточках + понятный CTA на тостах. |
| Сломаются `Auth.checkAccess()`-зависимые места (избранное, тарелка) для гостя | средняя | На каждом вызове Auth-зависимой функции проверять `isLoggedIn()` и показывать CTA. Контроль через smoke-тест. |

---

## 10. Smoke-check этапа 1

Запуск этапа 1 считается успешным, **если все пункты ниже выполняются в инкогнито-окне без логина**:

- [ ] Открываем `plate.voronova.online` → главная **не редиректит** на login.
- [ ] На главной видны категории и счётчики рецептов.
- [ ] Клик на категорию → каталог рецептов открывается, не редиректит.
- [ ] Клик на free-рецепт → открывается **полностью** (фото, КБЖУ, ингредиенты, шаги).
- [ ] Клик на paid-рецепт → подробный preview-state: фото, КБЖУ, цитата, 3 ингредиента без количеств, первый шаг и корректный CTA для уровня доступа.
- [ ] Клик на «избранное» / «в тарелку» / «оценить» / «отзыв» у гостя → редирект на `login.html?return=<current_url>`.
- [ ] Клик на иконку тарелки в шапке → редирект на login с return.
- [ ] После логина с `return=` — пользователь попадает обратно на исходный рецепт/категорию.
- [ ] `cabinet.html` без логина → редирект на login (старое поведение сохраняется).
- [ ] `admin.html` без логина → редирект на login (старое поведение сохраняется).
- [ ] `recipe-editor.html` без логина → редирект на login (старое поведение сохраняется).
- [ ] Trial-пользователь: `free` и `trial` рецепты — полностью; `pro` — preview + CTA «Оформить Pro».
- [ ] Active-пользователь / admin: все три уровня (`free`, `trial`, `pro`) — полностью.
- [ ] Expired-пользователь: `free` — полностью; `trial` / `pro` — preview + CTA «Продлить».
- [ ] В **Network-ответе** `/content/recipes`:
  - для guest: у `trial` и `pro` рецептов **нет** `ingredients/steps/note`; у `free` — все поля есть.
  - для trial: у `pro` рецептов **нет** `ingredients/steps/note`; у `free`/`trial` — все поля есть.
  - для active/admin: все поля у всех рецептов.
- [ ] В **DOM** preview-рецепта **нет пустых блоков** ингредиентов / шагов / заметки — вместо них **один** CTA-блок.
- [ ] В admin-редакторе виден новый селектор `access_level` (free/trial/pro). При сохранении рецепта значение пишется в БД.
- [ ] Для рецептов, у которых только `is_free` (без `access_level`) — фронт fallback'ом считает `access_level = free` если `is_free=true`, иначе `pro`. Поведение не ломается.

## 11. Открытые вопросы

1. **Сколько free-рецептов оптимально?** Минимум 5-7, лучше 8-10. Нужно решение Юлии (см. §7).
2. **Что показывать в preview платного рецепта на `recipe.html`?** Решено (§6.4): фото, название, КБЖУ, время, цитату, 3 ингредиента без количеств и первый шаг без фотографии; остальной контент закрыт.
3. **Регистрация vs Вход.** На главной для гостя — одна кнопка «Войти» (с переходом на login, где есть вкладка регистрации)? Или две отдельные кнопки? Гипотеза: одна «Войти», на login форма универсальная.
4. **Trial-плашка «7 дней бесплатно» в шапке гостя** — нужна или это уже агрессивно? Гипотеза: одна неброская плашка «7 дней бесплатно» рядом с «Войти».
5. **`updatePlateIcon()` для гостя** — скрывать иконку тарелки совсем или показывать «0» и при клике CTA? Гипотеза: показывать, при клике CTA на login.

**Решённые вопросы (вынесены из списка):**
- ~~Локальная тарелка для гостя~~ → **НЕ в этапе 1**, отдельный этап 1.5 (см. §6.9).

---

## 12. Метрики успеха

После запуска гостевого режима смотрим за **2 недели**:

- **Посещения `plate.voronova.online`** (раньше = только зарегистрированные, теперь — все) — должно вырасти в 5-20x в зависимости от трафика.
- **Конверсия гость → регистрация** — целевая 5-15% (зависит от качества free-рецептов и UX превью).
- **Конверсия регистрация → активная подписка** — не должна упасть. Если упала больше чем на 30% — пересмотреть состав free-набора.
- **Среднее время на сайте у гостей** — индикатор, что контент цепляет.
- **Bounce rate на `recipe.html` для гостя** — если слишком высокий, превью неубедительное.

---

## 13. Файлы для правки (чеклист)

### Этап 1a — backend
- [x] `server/migrate-access-level.sql` — миграция (§5A.1). Идемпотентна: backfill из `is_free` выполняется ТОЛЬКО при первом создании колонки.
- [x] [server/src/middleware.js](server/src/middleware.js) — добавлены `getUserTier()` и `userCanSeeRecipe()`.
- [x] [server/src/routes/content.js](server/src/routes/content.js) — переписан stripping в `GET /content/recipes` (§5A.3); admin write-эндпоинты принимают `access_level` с валидацией (§5A.7); невалидный input → 400, без silent fallback.
- [x] [server/__tests__/content.test.mjs](server/__tests__/content.test.mjs) — добавлены сценарии stripping по уровням (§5A.8) + тесты на валидацию `access_level`. 19/19 зелёные.
- [ ] **Ручной шаг:** применить миграцию на VPS, деплой API через `pm2 restart smartplate-api`. См. §13a.

### Этап 1b — frontend
- [x] [platform/data-v2.js](platform/data-v2.js) — `Auth.checkAccess({ allowGuest: true })`, `isGuest()`, `recipeAccessLevel()`, `canViewRecipe()` (по 3 уровням), `recipeAccessLabel()`, `recipePaywallCta()`; в `_mapRecipe()` маппится `access_level`.
- [x] [platform/index.html](platform/index.html) — `checkAccess({ allowGuest: true })`, шапка для гостя, кнопка тарелки → CTA login, новостные карточки на `canViewRecipe`.
- [x] [platform/category.html](platform/category.html) — `locked = !canViewRecipe(d)` (§6.3), `showLockedMsg(recipeId)` с CTA из `recipePaywallCta`, бейджи через `recipeAccessLabel`, гостевой fallback на действиях.
- [x] [platform/recipe.html](platform/recipe.html) — preview-state `renderRecipePreview()` для всех `!canViewRecipe()` (§6.4), CTA на действиях.
- [ ] [platform/login.html](platform/login.html) — поддержка `return=...` (есть, не трогали), опционально бейдж «7 дней бесплатно» — на будущее.
- [x] [platform/recipe-editor.html](platform/recipe-editor.html) — селектор `#re-access-level` (Pro/Trial/Free), legacy чекбокс `#re-free` скрыт и автосинхронизирован.
- [x] [platform/style-v4.css](platform/style-v4.css) — `.free-badge`, `.recipe-preview` с CTA-блоком.

### НЕ трогали
- `platform/cabinet.html`, `platform/admin.html` (и все `admin-*.html`).

---

## 13a. Деплой на VPS (ручные шаги)

Порядок строгий: **сначала миграция, потом API, потом фронт**. Иначе фронт может посыпать в API запросы под старую схему.

### 1. Миграция БД
```bash
ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
  < server/migrate-access-level.sql
```
Миграция идемпотентна: повторный запуск НЕ перезаписывает уже выставленные `access_level='pro'`. Ожидаемый вывод первого запуска: `NOTICE access_level: column created and backfilled from is_free` и `NOTICE access_level distribution: free=3, trial=52, pro=0`.

### 2. Деплой API
**Внимание:** `content.js` лежит в `src/routes/`, `middleware.js` — в `src/`. **Разные scp**, не объединять в один:

```bash
# 2.1. middleware.js → src/
scp server/src/middleware.js root@5.42.119.198:/var/www/smartplate-api/src/

# 2.2. content.js → src/routes/
scp server/src/routes/content.js root@5.42.119.198:/var/www/smartplate-api/src/routes/

# 2.3. Перезапуск
ssh root@5.42.119.198 "pm2 restart smartplate-api"
ssh root@5.42.119.198 "pm2 logs smartplate-api --lines 30 --nostream"
```

Объединённая `scp src/middleware.js src/routes/content.js dest/src/` положит **оба** файла в `dest/src/`, и `content.js` окажется по неверному пути — Node его не подхватит, а на VPS останется «мёртвая» копия. Не делать так.

### 3. Деплой фронта
```bash
scp platform/*.html platform/*.js platform/*.css \
  root@5.42.119.198:/var/www/smartplate-platform/
```
Nginx отдаёт фронт как статику, перезапуск не нужен.

### 4. Smoke-check
По чеклисту §10 (инкогнито-режим браузера).

---

## 14. Что делать перед началом реализации

> **Раздел исторический** — этап 1a + 1b уже реализованы. Сохранён как чеклист продуктовых решений для последующих этапов и контекста ревью.

1. **Подтвердить с Юлией** список из 5-10 free-рецептов (можно отложить — см. ниже про текущие 3).
2. **Решить открытые вопросы из §11:** количество free-рецептов, текст кнопки «Войти/Регистрация», плашка «7 дней бесплатно», поведение иконки тарелки.
3. **Убедиться, что в БД нет «случайных» free-рецептов** — сейчас 3 шт., посмотреть какие именно и подходят ли они для гостевой витрины.
4. **Зафиксировать вёрстку CTA и тостов** — общий стиль, чтобы не делать дважды.
