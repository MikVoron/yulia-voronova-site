# Фотографии готовых блюд к отзывам

Реализация находится в ветке `feat/review-photos-20261108`. Функция выключена по умолчанию; включение на production выполняется отдельным выпуском после проверки ресурсов и резервного копирования. Ниже описано поведение реализации, а не подтверждение установки на сервере.

## Пользовательский сценарий

- До трёх фотографий на существующий отзыв: одна оценка пользователя на рецепт сохраняется. Фото можно добавить вместе с отзывом или позже под своим отзывом. На странице рецепта, в категории и ингредиенте используется общий компонент.
- Большая кнопка «Добавить фото блюда», выбор по одной или нескольких, миниатюры и «Убрать». Не нужно менять размер или выбирать качество. При публикации пользователь заранее видит пояснение, что после проверки фото будут видны другим.
- Браузер автоматически уменьшает снимок до 1200 px и кодирует JPEG. Если браузер не умеет прочитать HEIC/HEIF или другой поддержанный файл, оригинал отправляется на сервер. Максимальный исходник — 20 МиБ; максимальное разрешение на сервере — 50 Мп.
- Сервер проверяет содержимое, поворачивает по ориентации, создаёт WebP до 1200 px и превью до 320 px, удаляет метаданные, включая EXIF/GPS. Оригиналы не сохраняются. GIF, SVG и произвольные документы не принимаются. HEIC обрабатывается локально через `heic-decode`/`libheif-js`, без внешних сервисов.
- До одобрения фото видит владелец и администратор. Остальные не могут получить даже файл по прямому URL. Текст отзыва публикуется по существующим правилам; у каждого фото отдельный статус.
- При обрыве сети выбранные файлы и текст остаются в открытой странице. Повтор использует тот же UUID и тот же обработанный файл, не создаёт второй снимок и не сохраняет отзыв повторно после подтверждённого ответа сервера. Перезагрузка/закрытие страницы не сохраняет неотправленные файлы.
- Пользователь может удалить свой снимок. Администратор может одобрить, отклонить с причиной или снять ранее одобренный снимок с публикации. Отклонённые файлы удаляются; причина остаётся владельцу.

## Хранение и ограничения

`REVIEW_PHOTOS_DIR` — абсолютный путь к отдельному приватному каталогу, например `/var/lib/smartplate/review-photos`. Он не должен попадать под nginx/static alias, быть внутри приложения или быть символической ссылкой. Владелец каталога — существующий системный пользователь API, каталог `0700`, файлы `0600`. Не помещать его в Git или в дерево публичного сайта.

PostgreSQL хранит метаданные, статусы и очередь писем. На диске только UUID-каталоги с `main.webp` и `thumb.webp`. Выдача через API проверяет разрешения при каждом обращении; `Cache-Control: private, no-store` позволяет закрывать старые ссылки после удаления/отклонения. Превью подгружаются при приближении к видимой части страницы.

Лимиты первой версии: 3 активных фото на отзыв, 12 успешно принятых фото за 24 часа на пользователя (удаление/отклонение не сбрасывает счётчик), 20 МиБ на запрос, 50 Мп, до 2 МиБ на пару производных, 2 ГиБ на хранимые производные, минимум 512 МиБ свободного диска перед обработкой. Одна обработка на PostgreSQL advisory lock между экземплярами API; максимум два принимаемых бинарных запроса на процесс. Уменьшение вынесено в отдельный дочерний процесс с тайм-аутом 30 секунд. Ограничение JS heap 192 МиБ **не является** ограничением всей памяти native/WASM: до выпуска нужен замер пикового RSS на типичных JPEG/HEIC и проверка лимитов окружения.

Удаление отзыва отсоединяет фото (`ON DELETE SET NULL`), что сразу закрывает доступ. Фоновая очистка удаляет такие файлы, отклонённые/удалённые снимки, а также оставшиеся после сбоя/удаления аккаунта файлы без записи в БД старше 24 часов. Метаданные удалённых файлов удерживаются 30 дней для квот/повторов. Успешно обработанные фото на проверке автоматически не удаляются.

## Модерация и уведомления

В админке появляется «Фото блюд» со счётчиком и фильтрами «На проверке / Одобрены / Отклонены». Очередь — источник истины, независимо от доставки почты. Письмо на `ADMIN_EMAIL` содержит имя, рецепт, количество и ссылку `admin.html?tab=review-photos`; закрытые изображения в письмо не вкладываются.

Записи уведомлений создаются в одной транзакции с фотографиями. После завершения пачки клиент помечает её готовой, фоновый обработчик отправляет письмо на следующем минутном запуске. Если вкладка закрылась, срабатывает 15-минутная задержка. Ошибка SMTP оставляет запись на повтор через 15 минут. При обычном повторе загрузки не создаётся новое письмо. Как у любой схемы с SMTP без транзакционного подтверждения, авария после принятия письма SMTP, но до записи `sent_at`, может привести к повторному уведомлению. Очередь проверки при этом остаётся корректной.

## Выпуск и откат

1. Проверить установленную версию Node (sharp требует Node >=20.9), CPU/RAM, свободный диск, существующий nginx API upload limit, текущие версии API/фронтенда и резервные копии. Зафиксировать исходные файлы и данные. Учесть production-only изменения, включая стили отзывов и настройки безопасности.
2. На Linux установить зависимости из `server/package-lock.json` через `npm ci`. Windows `node_modules` не копировать на VPS. Выполнить проверки обработчика, включая настоящий HEIC и большой JPEG, и одновременные запросы с реальной PostgreSQL. Не использовать production-БД для тестовых снимков.
   Для действующего сервера выбран отдельный codec-компонент из `server/photo-codecs/package*.json`: `npm ci --ignore-scripts --omit=dev` выполняется в его изолированном каталоге. `REVIEW_PHOTO_CODECS_DIR` указывает на защищённую версию компонента вне API. Общие `/var/www/smartplate-api/package*.json`, `node_modules` и launch-настройки PM2 этим способом не меняются; при отсутствующем кодеке нет отката к общему дереву зависимостей.
3. Применить `server/migrations/043_review_photos.sql` привилегированной миграционной ролью. Миграция повторяемая; зарезервирован номер 043, поскольку в основной рабочей папке есть отдельная незавершённая миграция 042.
4. Создать приватный каталог с правильным владельцем. Добавить его в резервное копирование вместе с БД, проверить восстановление пары БД+файлы. Удалённые файлы могут оставаться в старых резервных копиях до окончания их срока хранения.
5. На API-host установить `client_max_body_size 20m` для маршрута загрузки `PUT /content/reviews/<id>/photos/<uuid>`, тайм-аут передачи для мобильного соединения и тайм-аут ответа больше 30 секунд. Не менять глобальные лимиты других API без необходимости. CORS уже разрешает PUT и Authorization/Content-Type. Статический `/api/content/` proxy остаётся только для чтения; запись идёт на `api.voronova.online`.
6. Установить API и frontend с cache-version `20261108`, выставить `REVIEW_PHOTOS_DIR` и `REVIEW_PHOTOS_ENABLED=1`, перезапустить только API. При включённом флаге сервер проверяет доступ к каталогу. До включения форма не показывает загрузку и схема не используется.
7. Подтвердить установленные/публичные хеши, health, права процесса/каталога, загрузку с телефона, отсутствие доступа гостя и другого аккаунта к pending-файлу, одобрение, отклонение, удаление, поступление письма и фоновую очистку. Проверить 320/390 px и desktop. Сам факт успешного запроса не доказывает весь пользовательский сценарий.

Откат: выключить `REVIEW_PHOTOS_ENABLED`, вернуть согласованные API/frontend при необходимости. Сохранить миграцию, метаданные и приватные файлы; не удалять пользовательский контент при откате. При выключении функции её фоновые задания также останавливаются.

## Проверки

Фактически выполнено локально: `test-review-photo-images.cjs` (поворот, размеры, WebP, отсутствие EXIF, отказ SVG/GIF/битому файлу и изображению с заявленными 100 Мп), 8 тестов новых HTTP-маршрутов, 9 тестов сервиса на PGlite, все 10 тестов на настоящей временной PostgreSQL 16, включая параллельные соединения, и 8 браузерных сценариев на 320/390/1320 px. Проверены потерянный ответ и повтор без дублей, сохранение текста, лимит в 3 фото, удаление, замена повреждённого снимка, гостевой просмотр, модерация и отсутствие горизонтального переполнения/JS-ошибок. При первом запуске памяти компьютера не хватило; после освобождения более 4 ГБ проверки выполнялись последовательно.

Настоящий [HEIC-пример libheif](https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic): 718 114 байт входного файла → 234 364 байт WebP+превью, 1200×801 px, около 0,7 секунды, пиковый RSS дочернего процесса около 83 МиБ на этом компьютере. Это небольшой образец, а не замер 12/48-Мп снимка с телефона. В браузерной проверке JPEG 838 726 байт автоматически уменьшился до 159 360 байт перед отправкой.

Дополнительно прошли 78 проверок существующих маршрутов/писем/защиты/CSP. В полном наборе CSP остаются 4 исходных падения для login/index/recipe-editor/cabinet; соответствующие файлы этой функцией не менялись, расхождения подтверждены по `HEAD`.

- `cd server; node node_modules/vitest/vitest.mjs run __tests__/review-photos.test.mjs --maxWorkers=1 --no-file-parallelism` — SQL миграции и сервис на PGlite (PostgreSQL в памяти), реальные Fastify/JWT-проверки, реальная обработка JPEG, приватность, лимиты, идемпотентность, модерация, удаление, уведомления. PGlite имеет одну сессию и не заменяет тест advisory lock с несколькими соединениями PostgreSQL.
- `node scripts/test-review-photos-browser.cjs` — настоящие страницы и сжатие в Chrome, детерминированный API fixture, потерянный ответ/повтор, новый и существующий отзыв, лимит, админка, гостевой просмотр и размеры 320/390/1320 px. Артефакты — `.local/photo-browser/`.
- `sh scripts/test-review-photos-postgres.sh` — отдельный временный PostgreSQL 16, Unix socket без TCP и тест многосоединительного advisory lock; устанавливать зависимости и запускать только в изолированном тестовом каталоге.
- Windows: установить переносимые бинарные файлы `@embedded-postgres/windows-x64` версии 16 в `.local/pg-tools`, затем `node scripts/test-review-photos-postgres-windows.cjs`. Скрипт создаёт временный кластер на 127.0.0.1:59479 со случайным паролем, 16 МиБ shared buffers и без установки системной службы, после проверки останавливает и удаляет кластер. Артефакты и пароль не входят в Git.
- `node scripts/test-review-photo-images.cjs` и `review-photo-routes.test.mjs` — лёгкие проверки обработки/HTTP без PGlite и браузера.
- Регрессии: `content.test.mjs`, `email.test.mjs`, `review-replies-ui.test.mjs`, `csp-external-scripts.test.mjs` и `scripts/test-review-discussions-browser.cjs`.

Не считать наличие этих команд доказательством их прохождения: результаты фиксируются в отчёте реализации после фактического запуска.

## Подготовка рабочего сервера

Root-check передан пользователем: `rootChecked=true`, исходные backup-скрипт и права credentials подтверждены, исходный backup cron присутствует, таблицы reviews/comments есть, таблиц фото пока нет, photo-настроек в `.env` нет.

Read-only сверка 8 ноября: Node 20.20.1, API UID/GID 997, `/health` status/db ok, около 38 ГБ свободного диска и 1,9 ГиБ доступной памяти. Есть encrypted DB backup за 8 ноября 03:00; наличие файла не доказывает загрузку в B2 или восстановление. Nginx сейчас ограничивает все запросы 8 МиБ; маршрут фото должен получить отдельный предел 20 МиБ и тайм-аут для мобильной загрузки.

Выполнено сравнение 13 несекретных файлов production. Сохранены live-only подписи Jivo в трёх HTML и разметка friend badge в recipe-page.js. Другие исходные API-файлы и package/lock совпали с базой реализации после нормализации переводов строк. Секретный `.env` и backup credentials не скачивались. Следующий privileged check — только чтение: `review-photos-readiness.py`, без миграции, установки или перезапуска. Он проверяет схему, защищённые backup-права и текущий backup-скрипт перед подготовкой включения фото.

## Отдельный этап хранилища и резервного копирования

Первый privileged запуск пакета `244419a55d0f` остановился до создания хранилища: общий каталог `/root/smartplate-rollbacks` не совпал со строгим ожидаемым режимом. Рабочие хеши и health после отказа подтверждены. Исправленный установщик использует собственный `/root/smartplate-review-photos` с режимом 0700, сохраняя общий каталог старых контрольных копий без изменений. Перед привилегированным исполнением снова проверяются хеши и защищённое копирование.

Запуск `abf0a698b253` создал приватное хранилище и codec-компонент, прошёл probe UID997 и остановился на первой резервной копии: имя `runuser` отсутствовало в ограниченном PATH backup-процесса (`/usr/bin:/bin`), тогда как бинарный файл расположен в `/usr/sbin`. Cron не установлен, API/фронтенд не менялись, health и baseline подтверждены. Исправление использует абсолютный `/usr/sbin/runuser` и отдельный preflight всех инструментов с тем же окружением. Установленный backup-helper разрешено заменить только при точном старом SHA-256 `e13a84006c361deb95151286b67777cba2bae524047816b78ea74103ff2b6ced`, с предварительной копией в защищённый checkpoint. Неизвестный файл остаётся нетронутым.

`install-review-photos-storage.py` подготавливает каталог фото `997:997 0700`, неизменяемый root-owned codec-компонент и backup-job. Код API, его общие зависимости, `.env`, nginx и схема БД на этом этапе не меняются. Функция остаётся выключенной. Файлы пакета и codec-компонента проверяются по SHA-256 и копируются в root-only checkpoint перед привилегированными действиями. Чтение/запись каталога и JPEG/HEIC-кодеки проверяются от UID/GID 997.

Новый helper `/opt/voronova/review-photos-backup.py` создаёт зашифрованный снимок БД вместе с активными фото. Во время формирования снимка advisory lock не допускает новые загрузки, SHARE lock таблицы фото не допускает их удаление или смену статуса; чтение остаётся доступным. После создания локального снимка блокировки отпускаются. GPG использует отдельный временный homedir, существующий root-only passphrase-файл, AES256; credentials разбираются как литералы и передаются AWS только через окружение.

Архивы хранятся отдельно от прежних DB-backup: локально `/opt/voronova/photo-backups` (3 успешных снимка), в B2 — `db/photos/` (удаление собственных объектов старше 30 дней; физическое хранение старых версий зависит от политики bucket). Исходный DB backup и его cron сохраняются. Для каждого снимка проверяются расшифровка и точное совпадение всего tar, а после загрузки — размер/metadata SHA-256 объекта. При первой установке архив также скачивается из B2 и сравнивается побайтовой контрольной суммой. Это проверка архива, **не восстановление production-БД**; поле `fullDatabaseRestored` остаётся false.

Cron нового job устанавливается последним, после успешной проверки первой облачной копии: 03:30 по времени сервера. Локальная и удалённая ротация затрагивает только специальный photo-prefix/имена. Неполная локальная попытка получает суффикс `.failed` и не учитывается как сохранённый успешный снимок. При недостатке 8 ГиБ свободного места новый backup отказывается от запуска, не удаляя старые локальные копии.

До установки выполняются Python unit-тесты и `test-review-photos-backup-linux.sh`: отдельная PostgreSQL без TCP, только искусственные данные, временный GPG-пароль, восстановление синтетической БД и проверка байтов фото; B2 и production credentials в репетиции не используются.

Linux-репетиция пакета `244419a55d0f` выполнена: 8 unit-тестов прошли; `REVIEW_PHOTOS_BACKUP_FIXTURE_OK` подтвердил `syntheticDatabaseRestored`, `photoBytesRestored`, `encryptedRoundtrip`, `concurrentPhotoWritesBlocked`, при `productionDatabaseConnected=false` и `cloudUsed=false`. Временная PostgreSQL остановлена и удалена. Пакет проверен через `--check`: 198 codec-файлов, хеш компонента `612dc9263eea61be52a055499092883d1a73be31251b53018d7cb5ce6275c8b5`; production baseline и health совпали. Установка инфраструктуры пользователем пока не выполнена.

## Final release checkpoint, 2026-11-08

Infrastructure installation `6fa510fcbe2b` succeeded in the operator console. Protected receipt: `/root/smartplate-review-photos/review-photo-storage-35bx0em5/result.json`. The codec component and private photo directory were verified as UID/GID 997. The initial encrypted backup was uploaded, downloaded, and matched; the 03:30 photo-backup cron was installed. Production API PID remained 549462 and the feature remained disabled. This supersedes earlier pending infrastructure notes above.

`build-review-photos-release.py` packages exactly 8 API/migration files, 10 frontend files, and the existing API nginx configuration with one narrow 20 MiB upload location. Global dependencies and unrelated nginx locations remain guarded by their captured hashes. Three photo environment values are appended inside a root-only checkpoint; no environment values or credentials enter the package or output.

`install-review-photos-release.py` verifies the infrastructure receipt, creates a private database dump, checks nginx/JS/migration syntax, and probes an independent systemd timer before changing application files. A separate 15-minute rollback timer is armed before applying the additive migration. A new encrypted backup containing the photo schema must pass its remote-download check before enabling the API. Installed hashes, API UID/GID/health, anonymous access controls, frontend asset hashes and HTML markers must all pass before confirmation. A terminal decision is persisted under a file lock before the timer is stopped. This is scoped release recovery, not the separately paused boot-recovery framework.

On failure, the protected rollback restores touched files, nginx, and environment values, then restarts the previous API. Additive photo tables and any new user photo files are retained, so rollback does not discard user submissions. Hash guards refuse to overwrite unrelated intervening changes. The rollback CLI is `/usr/bin/python3 <protected-release-checkpoint>/install.py --rollback`; it becomes a no-op after a confirmed release. A database restore is never automatic.

Fault tests use temporary files only. Linux tests additionally kill a writer process after replacing files and run rollback from a separate process. The production timer probe and real schema checks run only during the final root installation. Public browser verification follows the actual release; packaging or pushing alone does not establish that the feature is live.

The first final installer (`22122532649a`) created the additive schema and verified its encrypted remote backup, then rolled back application files after an authentication probe failed. Independent checks confirmed all 19 guarded files matched the old baseline and API/database health was good (API PID 596703, UID/GID 997). The failure was reproduced in isolation: the Python client incorrectly attached `Content-Type: application/json` to a bodyless DELETE, so Fastify rejected the empty JSON body with 400 before its authentication hook. The corrected client omits content type for bodyless requests and uses the actual binary type for upload probes. `test-review-photos-release-http.cjs` reproduces the malformed legacy request, then runs the exact Python smoke checks against a real isolated Fastify HTTP server with production middleware/plugins. Database access and mail are forbidden in that fixture. The photo runtime itself did not change for this fix; retained additive tables support an idempotent retry.

Public HTML probes now select an actual ingredient ID from `ingredient_catalog`, just as recipe/category IDs come from the live catalog. The browser fixture's `oatmeal` ingredient ID is synthetic and returned 404 on the live site; it must not be used as a production smoke target. HTML templates are read on each request, so replacing the frontend after restarting the API does not leave old templates cached in the API process.
