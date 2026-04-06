# Workflow деплоя для yulia-voronova-site

## Структура проекта
```
yulia-voronova-site/
├── platform/          ← фронтенд (HTML/JS), деплоится на VPS
│   ├── *.html         ← страницы кабинета, рецептов, логина
│   ├── data-v2.js     ← клиентская библиотека (Auth, Plate, etc)
│   └── style-v4.css   ← стили
├── server/            ← бэкэнд (Node.js), деплоится на VPS
│   ├── src/routes/auth.js
│   ├── index.js
│   └── ...
├── .deploy-main/      ← worktree ветки main (НЕ трогать)
└── main branch        ← GitHub Pages (основной сайт voronova.online)
```

## Серверы
- **API:** root@5.42.119.198:/var/www/smartplate-api/
- **Frontend:** root@5.42.119.198:/var/www/smartplate-platform/
- **DB:** smartplate_db (PostgreSQL, пароль в .env на VPS)
- **PM2 process:** smartplate-api (управляется pm2)

## Commits и версионирование

### Cache-bust версии data-v2.js
Каждый раз когда меняешь `platform/data-v2.js`:

1. Получи текущий unix timestamp:
```bash
date +%s
```

2. Обнови версию во всех HTML файлах где используется data-v2.js:
```bash
# Пример: замени 1774559463 на новый timestamp
sed -i 's/data-v2\.js?v=1774559463/data-v2.js?v=1774804585/g' \
  platform/cabinet.html \
  platform/login.html \
  platform/auth-callback.html \
  platform/index.html \
  platform/category.html \
  platform/recipe.html \
  platform/admin.html
```

3. Коммитируй ВСЕ изменения (data-v2.js + все HTML с новой версией):
```bash
git add platform/data-v2.js platform/cabinet.html platform/login.html ... server/src/routes/auth.js
git commit -m "Fix avatar/name wipe on re-login and early-bird shown for active subscribers

- login(): only sync name/avatar from server if they are truthy
- /auth/verify: call ensureAvatarColumn() before SELECT
- cabinet: loadSubscription() returns true if active, loadEarlyBird() skipped for active subscribers

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Правила коммитов
- **Всегда используй `git add [файлы]`** — добавляй только изменённые файлы (не `git add .`)
- **Не коммитим untracked файлы** типа `.deploy-main/`, `docs/`, `AI_HANDOFF_*.txt`
- **Commit message:**
  - Начни с краткого описания проблемы/фикса
  - На новой строке подробнее что изменилось (bullet points)
  - **ВСЕГДА** добавляй строку: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Деплой на VPS

### 1. Деплой backend (auth.js)
```bash
scp server/src/routes/auth.js root@5.42.119.198:/var/www/smartplate-api/src/routes/auth.js
```

### 2. Деплой frontend (platform/)
```bash
scp platform/data-v2.js \
    platform/cabinet.html \
    platform/login.html \
    platform/auth-callback.html \
    platform/index.html \
    platform/category.html \
    platform/recipe.html \
    platform/admin.html \
    root@5.42.119.198:/var/www/smartplate-platform/
```

Или одной командой (как я делаю):
```bash
scp file1.js file2.html file3.html ... root@5.42.119.198:/var/www/smartplate-platform/
```

### 3. Restart backend
```bash
ssh root@5.42.119.198 "cd /var/www/smartplate-api && pm2 restart smartplate-api && pm2 status"
```

### 4. Verify
```bash
ssh root@5.42.119.198 "ls -la /var/www/smartplate-platform/*.html /var/www/smartplate-platform/data-v2.js"
```

## Полный workflow (пример)
```bash
# 1. Правим файлы локально
# platform/data-v2.js, server/auth.js, platform/cabinet.html, etc.

# 2. Обновляем cache-bust версию
date +%s  # → 1774804585
sed -i 's/data-v2\.js?v=OLD_TIMESTAMP/data-v2.js?v=1774804585/g' platform/*.html

# 3. Коммитим в feature branch
git add platform/data-v2.js platform/cabinet.html platform/login.html ... server/src/routes/auth.js
git commit -m "Fix avatar/name wipe on re-login and early-bird shown for active subscribers
..."

# 4. Пушим в origin
git push origin feature/harvard-plate

# 5. Деплоим backend
scp server/src/routes/auth.js root@5.42.119.198:/var/www/smartplate-api/src/routes/auth.js
ssh root@5.42.119.198 "pm2 restart smartplate-api && pm2 status"

# 6. Деплоим frontend
scp platform/data-v2.js platform/cabinet.html platform/login.html ... \
    root@5.42.119.198:/var/www/smartplate-platform/

# 7. Проверяем
ssh root@5.42.119.198 "ls -la /var/www/smartplate-platform/data-v2.js"
```

## Миграции БД
Если требуется миграция (как с avatar колонкой):

1. Создаёшь файл `server/migrate-*.sql`:
```sql
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
COMMIT;
```

2. Запускаешь на VPS:
```bash
ssh root@5.42.119.198 "sudo -u postgres psql -d smartplate_db < migrate-user-avatar.sql"
```

3. **Важно:** убедись что бэкэнд код уже вызывает `ensureAvatarColumn()` перед использованием колонки — так миграция сработает автоматически при первом запросе если её забыл запустить вручную.

## Важные замечания

### .deploy-main worktree
- Это рабочее дерево ветки `main` (GitHub Pages, основной сайт voronova.online)
- **НЕ трогай** — там может быть cherry-pick конфликт из прошлых сессий
- Platform файлы деплоятся только на VPS, не в main

### SSH ключи
- VPS достаточно быстро отвечает (~1-2 сек на scp)
- Убедись что SSH ключ добавлен (иначе будет просить пароль)

### Проверка на VPS
После деплоя всегда проверяй:
```bash
# Файлы доставлены
ssh root@5.42.119.198 "ls -la /var/www/smartplate-platform/data-v2.js"

# Backend работает
ssh root@5.42.119.198 "pm2 status"
```

### Тестирование
После деплоя протестируй сценарии:
1. **Для auth fixes:** логин → имя → аватар → Ctrl+F5 → logout → логин снова
2. **Для early-bird:** при активной подписке карточка должна быть скрыта
3. **Проверка в консоли:** `Auth._subStatus`, `Auth.getAvatar()`, localStorage

## Git правила (strict)
- ✅ Добавляй только изменённые файлы: `git add platform/data-v2.js server/auth.js`
- ❌ Никогда не используй `git add .` или `git add -A`
- ❌ Никогда не коммитишь `.env`, `.deploy-main/`, `docs/`, `*.txt`
- ✅ Всегда пушишь: `git push origin feature/harvard-plate` (или текущую ветку)
- ✅ Всегда добавляй `Co-Authored-By` в commit message

## Troubleshooting

### Проблема: файлы на VPS старые
- Проверь timestamp: `ssh root@5.42.119.198 "stat /var/www/smartplate-platform/data-v2.js"`
- Перезалей через scp снова
- Убедись что scp команда скопировал правильные файлы (проверь пути)

### Проблема: бэкэнд не перезагружается
```bash
ssh root@5.42.119.198 "pm2 logs smartplate-api"  # смотри логи
ssh root@5.42.119.198 "pm2 restart smartplate-api --force"  # force restart
```

### Проблема: кэш не обновляется в браузере
- Сделай hard refresh: Ctrl+F5 или Ctrl+Shift+R
- Убедись что cache-bust версия обновлена в HTML (data-v2.js?v=NEW_TIMESTAMP)
