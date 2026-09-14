# Проверка восстановления backup SmartPlate

Статус 2026-09-14: **ограниченная проверка восстановления выбранного backup завершена**.
Итоговый root-only result.json и оба cleanup-отчёта переданы пользователем и сверены:
32 таблицы, 17369 строк, 29 непустых таблиц, invalidIndexes=0, databaseRestored=true.
Независимо подтверждены остановка временных unit, отсутствие runtime-каталогов и
здоровье production. Роли/исходные ACL не восстанавливались; бизнес-сценарии приложения
не тестировались. Это не полная проверка аварийного восстановления всего сервиса.

Предыдущий этап 2026-09-12: B2-копия скачана и проверена по закреплённому SHA-256.
Первый helper отказал на TOC; повторная проверка уже скачанной копии с исправлением
обработки EPIPE прошла: оглавление содержит 32 public-таблицы. Пользователь передал root-only
result.json: 271 entries, 32 publicTables / publicTableData, passed=true.
На том этапе восстановление реального backup ещё не выполнялось. Production БД, API, cron
и исходные backup-файлы не менялись.

## Текущие проверки

Read-only проверка VPS 2026-09-12 18:25–18:28 UTC:

- PostgreSQL 16 main online, порт 5432; `pg_restore` 16.13.
- Доступны initdb/postgres/pg_restore, AWS CLI, GPG и systemd-run.
- Свободно около 41 GiB диска и 3256 MiB available RAM на момент проверки.
- Публичный API `/health`: status/db ok.
- `/opt/voronova/backups`: root:root 755; три encrypted dump, каждый root:root 600.
- `/opt/voronova/backup.sh`: root:root 750, недоступен для чтения smartplate-admin.
- Файлы `.b2-credentials` и `.gpg-passphrase`: root:root 600; содержимое не читалось.

Выбран существующий архив:
`/opt/voronova/backups/smartplate_db_2026-09-12_03-00.dump.gpg`, 1585086 bytes.
Перед использованием повторно проверить наличие, размер и SHA-256: ежедневная
ротация может удалить этот файл. Не запускать backup.sh ради этой проверки:
он создаёт новый dump и удаляет старые локальные/облачные копии.

Локальный `server/backup.sh`, SHA-256 (LF):
`ce8b3726411ec8914213b7a70b84a4623ee1e041ad8229cfc098c44876950056`.
Пользователь передал SHA-256 серверного backup.sh: совпадает с локальным кодом.
Формат — pg_dump custom + GPG, bucket `voronova-backups`, prefix `db/`.
SHA-256 выбранного encrypted архива, прочитанный пользователем через sudo:
`d573ea4f66d9824849360ecacbd509428b5f6a824e711cc2265b54769c3a8a02`.

## Следующий небольшой шаг

Историческая команда чтения контрольных сумм — уже выполнена:

```bash
sudo /usr/bin/sha256sum /opt/voronova/backup.sh /opt/voronova/backups/smartplate_db_2026-09-12_03-00.dump.gpg
```

## Первый download/decrypt/TOC helper — скачивание прошло, TOC отказал

Код: `server/ops/backup/prepare.cjs`, тесты: `server/ops/backup/tests/prepare.test.cjs`.
Staging: `/home/smartplate-admin/backup-prepare-20260912-hbvNrb/`.
SHA-256 helper:
`a96d4ad765a854e46f66092a0ec1c6dabd5b1eb73a07a27c8cdb6b843c36d6ab`.
Сверены SHA-256 обоих staging-файлов. Preflight на VPS прошёл; тесты 6/6 на VPS,
5 passed / 1 Linux-only skipped на Windows (до изменения только Linux fixture setup).
Синтетический GPG-тест сначала выявил необходимость агента при **шифровании**.
Для создания искусственного ciphertext тест использует свой временный GNUPGHOME/агент,
затем останавливает его и успешно проверяет реальную расшифровку **без агента**.
Runtime helper не создаёт gpg-agent и не использует `/root/.gnupg`.

Границы подготовленного шага:

- Один закреплённый архив, checksum и endpoint. B2 только GetObject; Range ограничивает
  получение ожидаемым размером плюс один байт, длина и hash затем проверяются точно.
- Credentials разбираются как буквальные присваивания без выполнения shell-кода;
  неизвестный формат/endpoint — отказ. Ключи не передаются в аргументах и не выводятся.
- После проверки собственного fingerprint bootstrap копирует свои байты в новый
  root:root каталог 700 `/var/lib/smartplate-restore-drills/run-<16 hex>/` и запускает
  оттуда защищённую копию с чистым окружением, отключённым core dump, лимитом размера
  файлов 8 MiB и V8 heap 128 MiB. Команды имеют timeout, вывод ошибок скрыт от секретов.
- GPG получает passphrase через fd 3, без конфигов/agent; dump передаётся в памяти
  в `pg_restore --list`, затем Buffer обнуляется. На диск plaintext dump не записывается.
- **Нет SQL, подключения к PostgreSQL, создания БД или восстановления.** TOC подтверждает
  читаемость оглавления, но не полноту восстановления данных. После этого этапа в root-only
  каталоге остаются encrypted копия, код, служебный GNUPGHOME и безопасный result.json.
- `result.json` содержит `databaseRestored: false`, `plaintextFileCreated: false`,
  `productionDatabaseConnected: false` и счётчики TOC; персональные строки не выводятся.
- Исходный локальный архив и B2 не изменяются. При ошибке helper сообщает только код;
  не повторять автоматически и не выводить credentials или расшифрованный архив.

Историческая команда Timeweb, **уже выполнена; не повторять**:

```bash
sudo /usr/bin/node /home/smartplate-admin/backup-prepare-20260912-hbvNrb/prepare.cjs --run a96d4ad765a854e46f66092a0ec1c6dabd5b1eb73a07a27c8cdb6b843c36d6ab
```

Ожидаются `BACKUP_PREPARE_DIRECTORY`, `BACKUP_B2_COPY_VERIFIED`,
`BACKUP_DECRYPT_AND_TOC_OK tables=...`, `DATABASE_RESTORE_NOT_RUN`, без `FAILED`.
После результата проверить root-only result.json и API; только затем переходить к restore.

### Результат первого запуска и исправление TOC

Пользователь выполнил первый helper, run:
`/var/lib/smartplate-restore-drills/run-e76d043900822355`.
Вывод: `BACKUP_B2_COPY_VERIFIED`, затем `PREPARE_TOC` / `PREPARE_CHILD_FAILED`.
GPG и проверка сигнатуры PGDMP завершились до вызова TOC, но общий результат подготовки
не подтверждён. Зашифрованная `download.gpg` сохранена в root-only каталоге; plaintext
файл не создавался, подключения к БД и restore не выполнялись.

Read-only проверка 18:39 UTC: pg_dump, pg_restore и явный PostgreSQL 16 pg_restore
все версии 16.13; публичный health status/db ok. Версионного расхождения не обнаружено.
Воспроизведён дефект wrapper: Node spawnSync может вернуть `error.code=EPIPE` и
`status=0`, когда `pg_restore --list` успешно прочитал TOC и закрыл stdin до передачи
остатка тела архива. Старый wrapper считал любую `error` неуспехом. Точный низкоуровневый
код первого запуска не сохранён; EPIPE — воспроизведённая вероятная причина, не извлечённая
из первого run диагностика.

Исправление принимает EPIPE **только для TOC** и только при `status=0` без signal;
после этого обязательна проверка непустого оглавления. Ошибки pg_restore, timeout,
сигналы и переполнение буфера по-прежнему отклоняются. Ошибки других команд не смягчены.
Добавлены три теста, включая реальный pg_restore 16.13 с искусственным custom-header,
пустым TOC и большим фиктивным телом: воспроизводится EPIPE/exit0, пустой TOC всё равно отвергается.
Этот тест не является восстановлением и не использует реальную БД/backup.

Новый staging `/home/smartplate-admin/backup-recheck-20260912-v2JX8E/`:

- helper SHA-256 `52b6b391bb535e1151f1b6e0ff903b6e7525bb2c79c43e82ba0bd6bd1158199e`;
- hash parity обоих файлов, preflight OK; VPS 9/9, Windows 6 passed / 3 Linux-only skipped;
- новый `--recheck` использует только фиксированный encrypted файл первого run с
  исходным закреплённым hash, не обращается к B2 и не читает содержимое B2 credentials;
- создаётся новый root-only run, прежний run/код не меняются; passphrase снова передаётся
  через fd, расшифрованные байты остаются в памяти, SQL не выполняется;
- в консоль добавлены только безопасные `BACKUP_TOC_PROCESS status=... error=...`,
  в успешный result — `tocInputEarlyClose` и `source: verified-existing-b2-copy`.

Историческая команда recheck — **уже выполнена, не повторять**:

```bash
sudo /usr/bin/node /home/smartplate-admin/backup-recheck-20260912-v2JX8E/prepare.cjs --recheck 52b6b391bb535e1151f1b6e0ff903b6e7525bb2c79c43e82ba0bd6bd1158199e
```

Ожидаются `BACKUP_EXISTING_COPY_VERIFIED`, `BACKUP_TOC_PROCESS status=0 error=EPIPE`
(или `error=none`), `BACKUP_DECRYPT_AND_TOC_OK tables=...`, `DATABASE_RESTORE_NOT_RUN`,
без `FAILED`. Только после этого сверить root-only результат и готовить собственно restore.

Пользователь передал успешный вывод recheck, run:
`/var/lib/smartplate-restore-drills/run-623e21cd8157fdbf`.
Все маркеры присутствуют: existing copy verified, TOC status=0/error=EPIPE,
`BACKUP_DECRYPT_AND_TOC_OK tables=32`, `DATABASE_RESTORE_NOT_RUN`.
Это подтверждает воспроизведённый случай EPIPE на реальном архиве при успешном pg_restore --list.
В 18:46:12 UTC независимо проверены PostgreSQL 16 main online/5432, PM2 MainPID 762,
API PID 2918793 / UID/GID997, публичный health status/db ok.
Ctrl+C был введён после возврата shell prompt, уже после завершения helper.

Историческая команда чтения безопасного result.json — уже выполнена пользователем:

```bash
sudo /usr/bin/cat /var/lib/smartplate-restore-drills/run-623e21cd8157fdbf/result.json
```

Подтверждено: encryptedBytes=1585086, entries=271, publicTables=32, publicTableData=32,
databaseRestored=false, plaintextFileCreated=false, productionDatabaseConnected=false,
source=verified-existing-b2-copy, tocInputEarlyClose=true.
Закреплён decrypted SHA-256:
`80dff0ba8d012a05d57fe5f525ce6ac89f81a7eee317592a02b3ee2e21f40d5b`.

Основание synthetic-header: [PostgreSQL 16 WriteHead/WriteToc](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/bin/pg_dump/pg_backup_archiver.c).

Документация команд: [AWS CLI v1 GetObject](https://docs.aws.amazon.com/cli/v1/reference/s3api/get-object.html),
[GPG passphrase-fd / loopback](https://www.gnupg.org/documentation/manuals/gnupg/GPG-Esoteric-Options.html),
[PostgreSQL 16 pg_restore --list](https://www.postgresql.org/docs/16/app-pgrestore.html).

## Исходный план ограниченного restore-drill (выполнен; итог ниже)

1. Выполнено: скачан выбранный encrypted объект B2, hash совпал с локальным архивом.
2. Выполнено: расшифровка и TOC (32 public-таблицы); result.json передан и сверён.
3. Восстановить в одноразовую БД, предпочтительно в отдельном временном экземпляре
   PostgreSQL с собственным Unix socket, без TCP и с ограничениями ресурсов.
   Не подключаться к рабочему PostgreSQL для restore/drop, не запускать приложение,
   Telegram, cron или миграции. Точная схема изоляции требует проверки до запуска.
4. Проверить успешность pg_restore, структуру и содержимое таблиц агрегатами,
   не выводя персональные данные. Проверка восстановления не равна проверке всей бизнес-логики.
5. Остановить только тестовый экземпляр и удалить только проверенные тестовые данные,
   включая расшифрованный dump; исходные encrypted копии сохранить. Проверить cleanup и API.

Привилегированные действия — только через парольный sudo пользователя, по одной
точной команде. Новые инфраструктурные изменения, восстановление поверх production,
изменения retention, перезагрузка VPS и вывод секретов не разрешены этим этапом.

## Подготовка isolated restore — 2026-09-13 (UTC)

Код: `server/ops/backup/restore-contract.cjs`, `restore-worker.cjs`, `restore.cjs`;
тесты: `server/ops/backup/tests/restore.test.cjs`.
Staging: `/home/smartplate-admin/backup-restore-20260913-IKLOJC/`.
Итоговый bundle SHA-256 (фиксированный порядок трёх helper-файлов):
`b1a02e6022377bc88b396301a523341ce80072a1b7eb2017a065b5181c69cc22`.
Локальный и серверный bundle совпали после последних исправлений.

Проверено без sudo:

- Синтаксис трёх helper-файлов; Windows restore-тесты: 8 passed / 2 Linux-only skipped.
  Совместный прогон prepare + restore до последнего уточнения preflight: 14 passed / 5 skipped.
- VPS restore-тесты: 10/10, включая PostgreSQL 16 initdb → synthetic dump → restore
  (2 таблицы, 4 строки), отказ при нарушении foreign key, остановку собственного PostgreSQL
  и удаление собственного `/tmp/sp-db-test-*`. Это не systemd/DynamicUser-репетиция.
- Preflight итогового кода успешен: проверяет binaries, systemd 249, tmpfs `/run`,
  свободную память, отсутствие swap, точную идентичность API и доступность публичного health.
- В проверках после 21:00 UTC: PostgreSQL main online, MainPID 721; PM2 MainPID 762;
  API PID 2918793 / UID/GID 997; публичный health status/db ok.
  Полный снимок PID/files/health до и после systemd-репетиции ещё не получен.

Исправления, внесённые до привилегированного запуска:

- `umask 077` делал задуманные public code-каталоги и файлы недоступными DynamicUser.
  Теперь только собственные вновь созданные каталоги кода получают явный chmod 755,
  файлы кода — fchmod 644; `control` и результаты остаются 700/600. Есть Linux regression test.
- `pgrep` представлял PM2 process title с завершающим пробелом, хотя `/proc/.../cmdline`
  содержал точный известный title. Поиск допускает только завершающие ASCII-пробелы;
  затем обязательны единственный PID, точный argv и UID/GID 997. Проверено live preflight.
- Валидация worker теперь отвергает invalidIndexes, некорректные счётчики и UID;
  runner отвергает неподходящие/несвежие пути до вызова PostgreSQL.

Два отдельных пользовательских этапа:

1. `--rehearse <bundle-hash>`: только искусственные данные, не читает настоящий архив,
   result подготовки или GPG passphrase. Запускает один ограниченный transient systemd unit.
   Успех требует остановки unit, отсутствия его runtime-каталога и совпадения production
   snapshots. Маркеры: `RESTORE_REHEARSAL_OK`, `REAL_BACKUP_RESTORE_NOT_RUN`.
2. Только после проверки результата предыдущего этапа — `--run <bundle-hash>`:
   повторная synthetic-проверка, затем pinned encrypted/decrypted hashes и восстановление
   реального backup в другом временном unit. Команда этого этапа пока не выдавалась.

Настройки изоляции (14 сентября root-репетиция и её отчёты проверены): DynamicUser, собственный
`/run/sp-db-<id>-fixture|restore` на tmpfs, Unix socket без TCP, PrivateNetwork,
запрет доступа к production PostgreSQL/API/backup-каталогам, пустые capabilities,
MemoryMax=256M, MemorySwapMax=0, CPUQuota=50%, RuntimeMaxSec=180s, KillMode=control-group.
Transient unit должен удалить свой RuntimeDirectory при остановке; root-only отчёты
и код остаются в новом `/var/lib/smartplate-db-rehearsals/run-<id>/`.

В отличие от этапа TOC, restore **создаёт plaintext dump и файлы временной БД в tmpfs**.
Реальные строки не выводятся; после успешной остановки runtime должен отсутствовать.
Это не утверждение о криптографическом стирании RAM. Оригинальные владельцы/ACL
не восстанавливаются (`--no-owner --no-privileges`), бизнес-сценарии приложения не тестируются.

### Результат systemd-репетиции — 2026-09-14

Пользователь подтвердил переключение модели, затем выполнил `--rehearse` с закреплённым
bundle. Run: `/var/lib/smartplate-db-rehearsals/run-8acaf76e2ed8eb7f`.
Передал все успешные маркеры: `RESTORE_SYNTHETIC_OK`, `RESTORE_RUNTIME_REMOVED`,
`PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED`, `RESTORE_REHEARSAL_OK`,
`REAL_BACKUP_RESTORE_NOT_RUN`. Повторно эту репетицию не запускать.

Независимая read-only проверка 06:36:58 UTC:

- root-owned защищённые code-файлы без group/world write; bundle SHA-256 совпал;
- unit `sp-db-8acaf76e2ed8eb7f-fixture.service` inactive, его runtime отсутствует;
- для этого run restore-unit также inactive и restore-runtime отсутствует;
- API PID 2918793 / UID 997, PM2 PID 762, PostgreSQL main PID 721; health status/db ok.

Контрольная точка перед реальным запуском (история): backup на тот момент ещё не восстанавливался.
Пользователь передал `control/result.json`, `fixture.json`, `fixture-cleanup.json`; сверено:

- passed=true, stage=synthetic-only, databaseRestored=false, realArchiveRead=false;
- syntheticFixturePassed/cleanupComplete/productionUnchanged=true; helpersSha256 совпал;
- DynamicUser UID 62120, networkIsolated/productionPathsBlocked/capabilitiesZero=true;
- 2 таблицы, 4 строки, 2 непустые таблицы, invalidIndexes=0, constraintTest=true;
- postgresStopped=true; cleanup complete/unitStopped/runtimeRemoved=true.

В 06:43:58 UTC повторно проверены bundle защищённой root-owned копии и preflight:
оба успешны. Код не менялся после systemd-репетиции.

Историческая команда Timeweb — **уже выполнена; не повторять**. Реальный backup в новом
временном PostgreSQL, не в production:

```bash
sudo /usr/bin/node /var/lib/smartplate-db-rehearsals/run-8acaf76e2ed8eb7f/code/restore.cjs --run b1a02e6022377bc88b396301a523341ce80072a1b7eb2017a065b5181c69cc22
```

Команда использует защищённый код предыдущей репетиции только как bootstrap, создаёт
новый run с собственными code/control, снова проверяет synthetic fixture, затем pinned
backup из `run-623e21cd8157fdbf`. Старые run и исходные encrypted копии не меняет.
Ожидаются `RESTORE_DATABASE_OK tables=32`, `RESTORE_RUNTIME_REMOVED`,
`PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED`, `BACKUP_RESTORE_DRILL_OK`.
Пользователь передал успешный вывод; подробный результат проверяется ниже.
При FAILED не повторять автоматически; сначала проверить безопасные отчёты и уборку.
Sudo выполняет только пользователь в Timeweb; не запускать sudo через SSH.

### Реальный restore: выполнен, итоговые отчёты сверены

Run: `/var/lib/smartplate-db-rehearsals/run-5ddf3bdfa61a59f5`.
Пользователь передал `RESTORE_SYNTHETIC_OK`, `RESTORE_ARCHIVE_HASH_VERIFIED`,
`RESTORE_DATABASE_OK tables=32`, `RESTORE_RUNTIME_REMOVED`,
`PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED`, `BACKUP_RESTORE_DRILL_OK`.

Независимая проверка 2026-09-14 06:46:34 UTC:

- защищённый код нового run root-owned, без group/world write, bundle hash совпал;
- fixture и restore unit этого run inactive; оба `/run/sp-db-5ddf3bdfa61a59f5-*` runtime отсутствуют;
- API PID 2918793 / UID/GID 997, PM2 PID 762, PostgreSQL main PID 721; health status/db ok.

Пользователь передал безопасные `control/result.json`, `fixture-cleanup.json`,
`restore-cleanup.json`. Итоговые поля сверены:

- passed=true, databaseRestored=true, sourceRun=run-623e21cd8157fdbf;
- encryptedSha256=d573ea4f66d9824849360ecacbd509428b5f6a824e711cc2265b54769c3a8a02;
- decryptedSha256=80dff0ba8d012a05d57fe5f525ce6ac89f81a7eee317592a02b3ee2e21f40d5b;
- tableCount=32, totalRows=17369, nonemptyTables=29, invalidIndexes=0;
- syntheticFixturePassed=true, cleanupComplete=true, productionUnchanged=true;
- DynamicUser UID 61245, networkIsolated/productionPathsBlocked/capabilitiesZero=true;
- оба cleanup-отчёта: complete=true, unitStopped=true, runtimeRemoved=true;
- originalOwnershipAndAclRestored=false, applicationBusinessFlowsTested=false.

Ограниченный restore-drill выбранного архива закрыт. Повторный restore сейчас не нужен.
Подтверждено восстановление схемы/данных в отдельный PostgreSQL, а не полнота восстановления
всего сервиса, исходных ролей/ACL, приложения, медиа или загрузки ОС. Исходный encrypted
backup и root-only отчёты сохранены; временные БД и plaintext dump удалены с runtime.
Этот прогон не подтверждает свежесть всех последующих backup и не включает их ротацию.
