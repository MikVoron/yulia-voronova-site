# SmartPlate — release-day чеклист

Полная справка по архитектуре, доменам, путям и стеку — в [CLAUDE.md](../CLAUDE.md).
Этот файл — пошаговая последовательность для дня релиза, без дублирования общей документации.

VPS IP: `5.42.119.198`. SSH — **только по IP**, не по домену.

---

## 1. Перед релизом (локально)

- [ ] `git status` чистый (никаких хвостов от других задач в коммите)
- [ ] `cd server && npm test` — все зелёные
- [ ] `git push origin feature/harvard-plate`

---

## 2. Применить миграции (если есть новые)

Миграции **не автоматические**. Применять до деплоя кода, который от них зависит, иначе после.

```bash
scp server/migrations/013_mvp_indexes.sql root@5.42.119.198:/tmp/
ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/013_mvp_indexes.sql"
```

Идемпотентные миграции (`IF NOT EXISTS`) можно применять повторно.

---

## 3. Деплой — только то, что менялось

`scp` всё подряд — плохо: задеплоится чужой WIP. Запушите только реально изменённые файлы.

**Frontend платформы → `/var/www/smartplate-platform/`:**

```bash
scp platform/<changed-files> root@5.42.119.198:/var/www/smartplate-platform/
```

Перезапуск не нужен (статика, nginx).

**Backend API → `/var/www/smartplate-api/src/...`:**

```bash
# роуты:
scp server/src/routes/<changed>.js root@5.42.119.198:/var/www/smartplate-api/src/routes/
# корневые:
scp server/src/<changed>.js root@5.42.119.198:/var/www/smartplate-api/src/
# обязательный перезапуск:
ssh root@5.42.119.198 "pm2 restart smartplate-api && pm2 status"
```

---

## 4. Проверка после деплоя

```bash
bash server/post-deploy-check.sh        # health, DB, content arrays, SSL
bash server/smoke-test.sh                # + headers, CORS, paywall stripping, 401/403, rate limit
```

Оба должны выйти с `0`. Если smoke-test падает на paywall — это **критично**, откатывайте.

Ручная проверка золотого пути:
- [ ] Открыть https://plate.voronova.online → главная → рецепт → добавить в тарелку
- [ ] Разлогиниться, открыть платный рецепт → должен быть paywall, ингредиенты не видны
- [ ] Реальный admin → cabinet → admin (виден список платежей)

---

## 5. Бэкапы

Реальный формат файлов: `/opt/voronova/backups/smartplate_db_<YYYY-MM-DD>_<HH-MM>.sql.gz.gpg` (gzip → AES256-GPG, проверено 2026-05-10). Локально хранятся 3 последних, в B2 — 30 дней. Cron — ежедневно в 03:00 UTC.

Свежий бэкап вручную (после релиза, чтобы была точка отката после миграций):

```bash
ssh root@5.42.119.198 ". /opt/voronova/.b2-credentials && /opt/voronova/backup.sh"
ssh root@5.42.119.198 "ls -lh /opt/voronova/backups/ | tail -3"
```

Лёгкая smoke-проверка (файл создался, размер не нулевой):

```bash
ssh root@5.42.119.198 "ls -lh /opt/voronova/backups/*.sql.gz.gpg | tail -1"
```

Полная проверка целостности (требует passphrase из `/opt/voronova/.gpg-passphrase`, выполняется на VPS — расшифровка остаётся в pipe, на диск ничего не пишется):

```bash
ssh root@5.42.119.198 'F=$(ls -t /opt/voronova/backups/*.sql.gz.gpg | head -1) && \
  gpg --batch --decrypt --passphrase-file /opt/voronova/.gpg-passphrase "$F" 2>/dev/null | gunzip -t && echo OK'
```

**Restore-test:** делать только в отдельной test DB или локально. **НЕ** запускать `pg_restore` / `psql -f` поверх production `smartplate_db` — это уничтожит данные. Если нужен полный restore-drill, разворачивайте свежий dump в `smartplate_db_test` на VPS или локально на dev-машине, и удаляйте после проверки.

---

## 6. Rollback

- **Frontend:** `git checkout <prev-commit> -- platform/...` → заново `scp` тех же файлов на VPS
- **Backend:** `git revert HEAD` → `scp` затронутых файлов → `ssh ... "pm2 restart smartplate-api"`
- **Индексы:** обычно rollback не нужен. Если индекс мешает — `DROP INDEX IF EXISTS idx_*` (см. комментарий в самой миграции)
- **БД-данные:** `pg_restore` свежего бэкапа в **отдельную DB**, ручное копирование нужных строк. Прямой restore поверх prod — только если другого выхода нет и есть подтверждение.

---

## 7. После релиза

- [ ] Закрыть таски в трекере / отметить релиз
- [ ] Проверить через 30 минут: `pm2 logs smartplate-api --lines 50 --nostream` — нет всплеска ошибок
- [ ] Если меняли auth/middleware/content — посмотреть `audit_log` за последний час
