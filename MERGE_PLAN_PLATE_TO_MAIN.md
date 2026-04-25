# Merge Plan: `feature/harvard-plate` -> `main`

Короткий playbook для безопасного мержа Тарелки в `main`, чтобы:
- не потерять изменения основного сайта;
- не сломать публичный `voronova.online`;
- не забыть обязательные шаги по VPS/API/SQL.

## Что куда деплоится

- `main` -> `voronova.online` через GitHub Pages.
- `platform/` -> `app.voronova.online` через `scp` на VPS.
- `server/` -> `api.voronova.online` через `scp` + `pm2 restart smartplate-api`.

Важно: merge в `main` делает код публичной веткой основного сайта. Поэтому перед merge нужно отдельно проверить, что в `main` не уедет ничего незавершённого для публичного surface.

## До мержа

1. Убедиться, что Тарелка действительно готова к запуску.
2. Убедиться, что рабочее дерево чистое:
   - `git status --short --branch`
3. Проверить worktree и убедиться, что merge делается из основного репозитория, а не из служебного worktree:
   - `git worktree list`
   - если видишь отдельный `.deploy-main`, перейти обратно в основной repo перед merge
4. Создать локальные backup-ветки до любых действий:
   - `git branch backup-main-preplate-$(date +%Y%m%d) main`
   - `git branch backup-feature-preplate-$(date +%Y%m%d) feature/harvard-plate`
5. Сделать свежий backup БД перед SQL и merge:
   - `ssh root@5.42.119.198 "/opt/voronova/backup.sh"`
   - до SQL убедиться, что новый backup реально появился в B2
   - минимум проверить по времени файла в B2 console или через `b2 ls voronova-backups`
6. Применить обязательные SQL-миграции на VPS до merge:
   - `trial_fingerprints`
   - колонки в `subscriptions`
   - `audit_log`

Команда-шаблон для SQL:

```bash
ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-xxx.sql
```

Жёсткое правило:
- `force-push` в `main` запрещён.

## Предмерж-проверка

Перед реальным merge посмотреть актуальные пересечения:

```bash
git fetch origin
git diff --name-only $(git merge-base main feature/harvard-plate)..main
git diff --name-only $(git merge-base main feature/harvard-plate)..feature/harvard-plate
```

Особенно внимательно проверить общие файлы root-сайта:
- `guides.html`
- `index.html`
- `about.html`
- `404.html`
- `main.js`
- `main.min.js`
- `style.css`
- `style.min.css`
- `sitemap.xml`
- `blog.html`
- `scripts/update-blog.js`

Если список общих файлов стал заметно шире, обновить этот playbook перед merge.

## Правила резолва конфликтов

Уже зафиксированное правило из `CLAUDE.md`:
- `guides.html` -> принять версию `feature`
  Причина: feature полностью заменяет блок карточек, Safari-фикс в `style.css` подтянется отдельно.

Остальные общие файлы не принимать автоматически по памяти. Для них правило такое:
- если файл относится к текущему публичному сайту и обновлялся после расхождения веток, сначала считать `main` базовой правдой;
- если файл нужен для запуска Тарелки и его изменения осознанно должны стать частью публичного релиза, проверять руками diff по обеим сторонам;
- картинки с одинаковым содержимым не мерджить вслепую, но если это чистый `add/add` одинаковых бинарников, можно брать любую сторону после проверки имени и размера.

Чего не делать:
- не использовать `theirs` или `ours` массово на весь merge;
- не резолвить `main.js`, `style.css`, `sitemap.xml`, `blog.html` без ручного просмотра;
- не надеяться, что "потом поправим на проде".

## Порядок merge

Базовый вариант:

```bash
git checkout main
git pull --rebase origin main
git merge --no-ff feature/harvard-plate
```

Альтернатива, если к моменту релиза решишь, что `main` должна остаться максимально чистой и без всей внутренней истории платформы:

```bash
git checkout main
git pull --rebase origin main
git merge --squash feature/harvard-plate
git commit -m "Release: Plate to main"
```

Как выбирать:
- `--no-ff` — сохраняет полную историю `feature` в `main`; лучше, если важна детальная трассировка изменений.
- `--squash` — делает историю `main` чище; лучше, если `main` рассматривается прежде всего как ветка публичного релиза.
- Если нет сильной причины сохранять все 157 feature-коммитов в `main`, перед релизом отдельно решить, нужен ли тебе `--squash`.

Дальше:
1. Разобрать конфликты по одному.
2. Для каждого спорного root-файла открыть diff и принять осознанное решение.
3. После резолва:

```bash
git add <resolved-files>
git commit
```

## После merge

1. Ещё раз проверить, что в merge-коммит не попало ничего лишнего для публичного сайта.
2. Проверить ключевые страницы локально/в preview:
   - `index.html`
   - `guides.html`
   - `blog.html`
   - страницы платформы под `platform/`
3. Запушить `main`:

```bash
git push origin main
```

Это задеплоит `voronova.online` через GitHub Pages.

## План отката

Если merge или релиз пошёл не туда, откатываться не вручную по кускам, а по заранее понятному сценарию.

Откат публичного сайта после merge в `main`:

```bash
git checkout main
git log --oneline --max-count=5
git revert -m 1 <merge-sha>
git push origin main
```

Важно:
- откатывать через `git revert`, а не через `reset` + `force-push`;
- `force-push` в `main` не использовать даже при аварии.

Откат БД:
- использовать backup, сделанный перед миграциями;
- не пытаться "вручную быстро подкрутить SQL", если миграция уже повлияла на данные;
- до релиза держать под рукой имя/время последнего успешного backup.

Откат платформы:
- вернуть на VPS предыдущие рабочие файлы из `backup-feature-preplate-$(date +%Y%m%d)` или из заранее отмеченного стабильного commit;
- повторно залить их через `scp` в `/var/www/smartplate-platform/`.

Откат API:
- вернуть предыдущую рабочую версию `server/`;
- перезалить файлы на VPS;
- выполнить `pm2 restart smartplate-api`.

Если нужно откатывать сразу несколько слоёв, идти в обратном порядке релиза:
- API -> БД -> публичный сайт.

## Отдельный деплой платформы и API

После merge и push в `main` платформа всё равно деплоится отдельно на VPS.

Фронтенд платформы:

```bash
scp platform/*.html platform/*.js platform/*.css root@5.42.119.198:/var/www/smartplate-platform/
```

API:

```bash
scp server/src/routes/*.js root@5.42.119.198:/var/www/smartplate-api/src/routes/
scp server/src/*.js root@5.42.119.198:/var/www/smartplate-api/src/
ssh root@5.42.119.198 "pm2 restart smartplate-api"
```

## Smoke-test после релиза

- `voronova.online` открывается без поломки шапки, главной, гайдов и блога.
- `app.voronova.online` открывается и логин/кабинет работают.
- `api.voronova.online` отвечает без ошибок в логах PM2.
- `pm2 status` показывает `online` для `smartplate-api`.
- Рецепт с Тарелкой открывается и считает КБЖУ.
- Ничего платного/незавершённого не стало случайно доступно на публичном сайте.
- Проверить критичную цепочку подписки:
  создать тестового пользователя -> убедиться, что trial выдался -> через админку подтвердить оплату -> убедиться, что `subscriptions.status = active` и paywall снят.

Полезные команды:

```bash
ssh root@5.42.119.198 "pm2 status"
ssh root@5.42.119.198 "pm2 logs smartplate-api --lines 50 --nostream"
```

## Когда лучше остановиться и перепроверить

Остановиться перед commit merge, если:
- конфликтов стало сильно больше ожидаемого;
- непонятно, чью версию брать для `main.js`, `style.css`, `blog.html`, `sitemap.xml`;
- в `main` попадает незавершённый UI платформы;
- SQL на VPS ещё не применён;
- нет свежего backup БД.

В таком случае не дожимать merge силой, а отдельно пройтись по конфликтным файлам и обновить этот план.
