# SmartPlate — безопасный checklist релиза

Статус: обновлён 2026-09-10 после перевода API на UID `997`.

Этот документ описывает обычный релиз. Один крупный этап за раз:
проверка → checkpoint (когда нужен) → изменение → проверка → явное подтверждение.
Не смешивать продуктовые изменения, миграции БД и инфраструктуру в одном релизе.

## Неподвижные правила

- Подключение к VPS — только `smartplate-admin@5.42.119.198` по ключу. Root SSH
  отключён; аварийный доступ root — только через консоль Timeweb.
- Команды, требующие привилегий, пользователь выполняет в Timeweb через парольный
  `sudo`. Не передавать пароль в чат, скрипт или историю команд.
- API-код остаётся root-owned. Сам процесс `smartplate-api` обязан остаться
  UID/GID `997`; `.env` — `root:smartplate-api`, режим `640`.
- PM2-менеджер пока root-owned, поэтому перезапуск только так:

  ```bash
  sudo -H /usr/bin/env PM2_HOME=/root/.pm2 /usr/bin/pm2 restart smartplate-api
  ```

- Не выполнять широкий `scp` каталога, `git reset`, общий `npm audit fix` или
  ручной restore checkpoint поверх production.
- Не трогать `tmp/threads-og-audit/` в рамках релиза.

## 1. Перед началом — локально

1. Выполнить `git status --short --branch`; не включать чужие или временные файлы.
2. Сверить scope: frontend, API-код, зависимости или миграция БД. Если их несколько,
   разделить на отдельные релизы.
3. Запустить относящиеся к изменению тесты и `git diff --check`.
4. Создать отдельный commit, push в `origin/main`, сверить `HEAD == origin/main`.
5. До visual-изменений: макет → одобрение → изменение → commit → push → deploy →
   проверка. Для security/operations макет не нужен, но checkpoint и rollback нужны.

## 2. Выбрать безопасный путь

| Изменение | Нужен checkpoint | Порядок |
|---|---|---|
| Только frontend-статика | нет, если нет генераторов/конфигурации | stage точных файлов → `sudo install` → открыть live-страницу |
| API-код без `package*.json` и без миграций | рекомендуем | stage точных файлов → `sudo install` → restart PM2 → health/UID |
| `package.json` / `package-lock.json` | обязательно | только проверенный release helper с timer rollback; не запускать вручную `npm ci` в production |
| SQL-миграция | обязательно | checkpoint → SQL в отдельном reviewed-файле → код → проверка данных → backup |
| nginx/PM2/systemd/права | обязательно + репетиция | отдельный инфраструктурный этап, не сочетать с продуктовым релизом |

## 3. Stage файлов, а не прямой доступ root

Сначала передать только утверждённые файлы в закрытую папку администратора,
например `/home/smartplate-admin/release-staging/<release-id>/`, и записать их
SHA-256. Затем в консоли Timeweb установить каждый файл через `sudo install` в
точный production-путь.

Для обычного API `.js`-файла шаблон такой:

```bash
sudo install -o root -g root -m 644 \
  /home/smartplate-admin/release-staging/<release-id>/<file>.js \
  /var/www/smartplate-api/src/<file>.js
sudo -H /usr/bin/env PM2_HOME=/root/.pm2 /usr/bin/pm2 restart smartplate-api
```

Перед любым restart проверить, что API отвечает:

```bash
curl -fsS http://127.0.0.1:3000/health
```

## 4. Checkpoint для рискованных изменений

Перед API-зависимостями, SQL, правами, PM2/nginx или несколькими файлами выполнить
в консоли Timeweb:

```bash
sudo /bin/bash /home/smartplate-admin/api-checkpoint-20260909.sh --create
```

`CHECKPOINT_OK` означает, что создан root-only архив файлов и custom-format dump
БД. Это не команда на автоматическое восстановление: при инциденте восстанавливать
только проверенный нужный компонент.

## 5. Релиз зависимостей

Это особый сценарий. Перед ним обязательны:

1. `npm audit --omit=dev` в изолированной копии с будущим lock-файлом — ноль
   уязвимостей.
2. Установка в изолированной папке с `umask 022` и `--ignore-scripts`.
3. Проверка, что UID `smartplate-api` может загрузить Fastify, Nodemailer и
   транзитивные модули.
4. Fresh checkpoint и независимый 10-минутный timer rollback до первой замены
   файлов в production.
5. После restart: local/public health, PID UID/GID `997`, версии модулей и
   `npm audit --omit=dev` = 0. Лишь затем `--confirm` и `pm2 save`.

Не использовать `npm audit fix` или `npm ci` напрямую в `/var/www/smartplate-api`.
Сначала должен существовать поддерживаемый versioned helper с проверкой прав;
его создание — отдельный этап roadmap.

Подготовлен [прототип протокола 0.2.0](../server/ops/release/README.md) с read-only
планировщиком и локальными тестами. Production-команды в нём отсутствуют.
Перед следующим релизом зависимостей требуется завершить Linux-адаптер и
репетицию реального отката. Сборка выполняется вне live `node_modules`, rollback
возвращает сохранённые файлы без npm и без сети.
Подтверждение сначала сохраняет устойчивое решение, затем снимает таймер;
успех всей операции фиксируется только после проверенного cleanup. Интеграция
нового протокола с PM2 ещё не проверена; рабочий релиз пока не запускать.

## 6. Миграции БД

- Миграция — один reviewed `.sql`-файл, без динамических вставок в shell.
- До применения — checkpoint, dry-run/read-only проверка и понятный rollback.
- Передать файл в staging, затем временно положить его root/postgres-readable в
  `/tmp`; запускать через `sudo -u postgres psql -v ON_ERROR_STOP=1`.
- После миграции проверить целевые строки/индексы и API. Не делать restore dump
  поверх `smartplate_db`.

## 7. Обязательная проверка после API-релиза

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS https://api.voronova.online/health
sudo -H /usr/bin/env PM2_HOME=/root/.pm2 /usr/bin/pm2 list
ps -eo pid=,uid=,gid=,args= | grep '[v]ar/www/smartplate-api/index.js'
```

Ожидание: оба health возвращают `status: ok` и `db: ok`; процесс API — UID/GID
`997`. Для изменений доступа дополнительно проверить гостевой paywall и 401 на
приватных маршрутах. Для frontend — проверка реального браузера на desktop/mobile.

## 8. Rollback

1. Если API не проходит health, **не повторять apply**.
2. Если timer rollback уже включён, дать ему сработать либо запустить только
   проверенную команду rollback из того же release helper.
3. Для обычного code-only релиза вернуть только затронутые файлы из заранее
   сохранённой копии, затем restart PM2 приведённой выше командой.
4. Checkpoint с БД не восстанавливать автоматически. Полный restore — только в
   отдельную БД для диагностики или после отдельного решения.
5. После rollback повторить health, UID/GID, public API и проверить отсутствие
   зависшего timer.

## 9. Backup и наблюдение

- Scheduled backup проверять по фактическому формату и настройкам скрипта; не
  предполагать старый `.sql.gz.gpg`, когда текущая конфигурация использует custom
  dump с GPG.
- Проверка расшифровки и `pg_restore --list` полезна, но полноценный restore-drill
  выполнять ежемесячно в отдельной БД и проверять retrieval из Backblaze B2.
- Через 30 минут после рискованного релиза проверить monitor и PM2 error log;
  при сбое использовать внешнюю HTTP(S)-проверку, а не только VPS-local monitor.

## 10. Завершение

- Записать commit, production path, checkpoint, выполненные проверки и итог.
- Сверить `HEAD == origin/main`; не создавать повторный deploy, если Git уже
  совпадает, а проблема только в browser cache или внешнем сервисе.
- Не удалять release artifacts, checkpoint или audit logs до следующей стабильной
  точки, если только это не отдельная согласованная операция.
