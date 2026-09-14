# API release helper — прототип протокола 0.2.0

Подготовительный шаг от 2026-09-10. **Production-исполнение ещё не реализовано.**
Production-планировщик `plan.cjs` поддерживает только `--plan`; `--apply`, `--confirm`, `--rollback` и любые
другие команды завершаются отказом до работы с файлами. Запускать через sudo не нужно.

Это поддерживаемое начало общего helper, а не перенос одноразового сценария
`f0316c1`. Первая версия протокола ограничена двумя файлами зависимостей.
Обновление произвольных исходников API потребует отдельной схемы и тестов.

## Файлы и безопасный запуск

- `protocol.cjs`: валидация manifest, хешей, package/lock и переходов состояний.
- `plan.cjs`: чтение manifest и bundle, вывод плана без записи и запуска команд.
- `tests/protocol.test.cjs`: тесты протокола и файлового планировщика; без npm,
  сети, PM2, systemd, БД или импорта приложения.

Из корня репозитория, Node 20+:

```text
node --test server/ops/release/tests/protocol.test.cjs
node server/ops/release/plan.cjs --plan <manifest.json> <bundle-directory>
```

Bundle содержит `package.json` и `package-lock.json`. Manifest имеет строго
заданные поля; произвольные пути, shell-команды, параметры PM2 и секреты запрещены.
Хеши — SHA-256 точных байтов, commit — полный Git SHA. Пример структуры
(значения в угловых скобках нужно заменить; это не готовый manifest):

```json
{
  "schemaVersion": 1,
  "releaseId": "deps-example",
  "commit": "<40 lowercase hex characters>",
  "kind": "dependencies",
  "files": [
    {"path": "package.json", "beforeSha256": "<64 hex>", "afterSha256": "<64 hex>"},
    {"path": "package-lock.json", "beforeSha256": "<64 hex>", "afterSha256": "<64 hex>"}
  ],
  "probes": [{"module": "fastify", "version": "5.12.3"}]
}
```

План проверяет новые байты и согласованность зависимостей package/lock, но ещё
не сверяет `beforeSha256` с VPS и не устанавливает пакеты. Хеш и commit в
manifest не являются подписью или доказательством доверия автору bundle.

## Модель переходов

```text
prepared → armed → switching → pending → confirming → confirmed
             └─────────┴─────────┴──────────┘
                           ↓
                      rolling_back → rolled_back
```

Каждый переход привязан к manifest и ревизии состояния. Перед `armed` нужны
checkpoint, проверенные старые модули для offline-восстановления, тесты кандидата
от UID/GID 997 и активный таймер. `switching` записывается ДО первой замены.
Для `confirm` и финального `commit` необходим запас более двух минут до срока
отката. Перед `commit` повторно проверяются health/доступ, процесс, сохранённый
PM2 и ещё активный таймер. Затем адаптер обязан атомарно сохранить `confirmed`
с fsync файла и каталога; **только после этого** можно снимать таймер.

Решение и уборка разделены: `confirmed`/`rolled_back` с `cleanupComplete: false`
означают устойчивое решение, но ещё не завершённую операцию. Отдельный переход
`cleanup` устанавливает `cleanupComplete: true` после проверки остановленного
таймера и отсутствия работающего rollback service. Ошибка или обрыв уборки не
меняют выбранную версию. Повторный rollback в терминальной фазе — no-op, а не
команда снова менять файлы; повторный cleanup допустим. До терминального решения
cleanup запрещён. Восстановление также сохраняет `rolled_back` до снятия таймера.

Будущий адаптер не должен ждать завершения rollback service, удерживая lock:
тот может сам ждать эту блокировку. После устойчивого решения нужно снять таймер,
освободить lock, дождаться выхода уже запущенного rollback, снова взять lock,
перечитать состояние/ревизию и проверить уборку. Сам rollback service не должен
ожидать собственного выхода: уборку завершает отдельный контроллер. Указатель
на незавершённую операцию сохраняется до cleanup; новый релиз до этого запрещён.

Версия схемы состояния теперь `2` (manifest остаётся `1`). Старые состояния
не принимаются автоматически: обновлять helper при незавершённой операции
запрещено. Стенд v1 в admin staging и его защищённые копии не обновлялись.

Ошибка отката сохраняет `rolling_back`; повторная попытка разрешена. Завершённые
релизы повторно не применяются и не откатываются таймером. Аварийный откат уже
подтверждённого релиза будет отдельной явно запрошенной операцией.

Тесты `protocol.test.cjs` моделируют последовательное выполнение конкурирующих команд. Реальный
межпроцессный lock, fsync и запуск systemd здесь отсутствуют: это нельзя считать
репетицией Linux-отката. Флаги evidence в протоколе должны поступать из будущих
проверок адаптера, а не из пользовательского JSON.

## Требования к следующему шагу — Linux-адаптеру

1. Один root-owned глобальный lock (`flock`) для подготовки, переключения,
   confirm и timer rollback. Читать состояние заново под lock; атомарная запись,
   fsync файла и каталога. Проверять симлинки, владельца и права всех предков.
2. Проверять хеш всего комплекта helper, manifest, исходного кода и сохранённого
   PM2. Из admin staging копировать в root-owned область; повторно сверять хеши.
   Не исполнять admin-owned helper по таймеру. Не допускать подмены между
   проверкой и копированием. Ограничить размеры и типы файлов.
3. Зависимости собирать отдельно от live `node_modules`, под непривилегированным
   пользователем, с `umask 022` и `--ignore-scripts`. Проверять реальную загрузку
   всех прямых runtime-зависимостей и необходимых транзитивных модулей от UID 997,
   включая native-модуль bcrypt. Тесты должны работать с будущими зависимостями.
4. До переключения сохранить и проверить точную локальную копию старых модулей,
   package-файлов и их прав. **Rollback не вызывает npm и не требует сети.**
   Сохранять несколько компонентов с журналом каждого шага, чтобы восстановить
   их после обрыва между операциями. API не должен читать частично заменённые
   модули; способ короткой остановки/переключения сначала проверить на fixture.
5. Непосредственно перед переключением — новый checkpoint; не восстанавливать
   БД, SSH, frontend или `.env` при откате зависимостей. Сохранять sitemap symlink.
6. Таймер запускает защищённую копию helper. Нельзя снимать таймер после
   неуспешного rollback. Нельзя одновременно выполнять rollback и confirm.
   Протокол clock/deadline должен учитывать часы systemd и перезагрузку машины.
7. Проверки live: стабильный PID, UID/GID 997, нулевые capabilities, local/public
   health, каталог/paywall/private 401, sitemap и сохранённый PM2. Ошибка проверки
   должна завершать конкретный шаг, даже внутри условного цикла ожидания.
8. Применять порядок 0.2.0: устойчивое терминальное решение, затем повторяемая
   уборка. Обрыв в `confirming` остаётся откатываемым, обрыв после сохранения
   `confirmed` не меняет версию. Нельзя сообщать полное завершение до cleanup.
9. Все логи с потенциальными секретами — root-only; в консоль только безопасные
   статусы. Не использовать `accept-new` с `UserKnownHostsFile=NUL`: для SSH
   проверять известный ключ сервера, подтверждённый через консоль провайдера.

## Условия допуска к production

### Boot/clock recovery — локально проверенная политика

`recovery-policy.cjs` содержит чистые функции принятия решения и переходов
восстановления. Они не выполняют файловые операции, PM2 или systemd.
`tests/recovery-policy.test.cjs`: 16/16; вместе с PM2 contract-тестами общий
Windows-прогон — 41 passed, 7 Linux-only skipped; на VPS — 48/48 без пропусков.
Проверяются цепочки переходов протокола с модельными
часами; это не проверка реальной перезагрузки, fsync или восстановления PM2.

Запись recovery имеет схему `2`, отдельную от версии протокола `0.2.0`, схемы
состояния `2` и manifest `1`. В неё входят `releaseId`, `manifestSha256`, Linux
boot ID, начальные значения realtime/monotonic и два срока отката. Проверяются
принадлежность текущему релизу, совпадение с `state.deadlineMs`, длительность
**обоих** окон ровно 600000 мс и отсутствие переполнения чисел. `createRecord`
использует тот же замер времени, что событие `arm`; более поздний замер запрещён.
Старая схема записи recovery не принимается автоматически.

Будущий адаптер под общим flock перечитывает состояние и запись recovery:

- `rolling_back` явно возвращает `rollback`, даже до deadline и при нормальных
  часах: прерванное восстановление должно продолжиться;
- другая boot ID, realtime меньше последнего времени протокола, monotonic меньше
  начального, расхождение прошедшего времени более 5000 мс или достижение любого
  deadline выбирают `rollback`;
- валидные `confirmed`/`rolled_back` возвращают только `cleanup` либо `idle`.
  Старые часы и запись recovery уже не нужны для этого решения. Повторный
  rollback не меняет файлы;
- `continue` означает лишь, что проверки часов пройдены. Все обычные проверки
  текущей фазы, health, таймера и двухминутного запаса остаются обязательными.

Повреждённые/отсутствующие метаданные незавершённого релиза и `prepared` вызывают
ошибку, а не разрешение продолжать. Они требуют отдельной обработки адаптером;
их нельзя «чинить» сбросом таймера или продолжением релиза. Выбранный rollback
нужно сразу устойчиво записать под тем же lock до первой операции восстановления.

`recoveryTransition(state, event)` допускает **только** `rollback`, `restored`,
`cleanup`. Для них время протокола равно `max(наблюдаемое realtime, lastNowMs)`:
перевод часов назад не блокирует восстановление и не уменьшает логическое время.
Исходный замер адаптер должен отдельно записать в журнал. Проверки manifest,
ревизии, допустимого перехода и evidence выполняет исходный `transition`.
Для `arm`/`switch`/`pending`/`confirm`/`commit` эта функция запрещена; их проверки
часов и deadline не ослаблены. При ошибке health/backup или незавершённой уборке
нельзя выдавать `restored`/`cleanup` с искусственно успешным evidence.

До допуска к production ещё нужны: подключение проверенного ниже control-envelope
к защищённому хранилищу адаптера, журнал намерения перед реальным запуском таймера,
обработка обрыва между подготовкой и `arm` в адаптере, защищённый boot
recovery service с определённым порядком относительно старта PM2, согласование
источника монотонного времени с таймером и репетиция всех этих границ. Две
независимые атомарные записи файлов не делают пару атомарной. Испытание настоящей
перезагрузки выполняется в отдельной тестовой среде; VPS с рабочим API ради него
перезагружать нельзя.

Локальный запуск:

```text
node --test server/ops/release/tests/protocol.test.cjs server/ops/release/tests/linux-storage.test.cjs server/ops/release/tests/recovery-policy.test.cjs server/ops/release/tests/pm2-sandbox.test.cjs
```

Следующий интеграционный этап — Linux-адаптер на искусственном процессе, файлах и
изолированном PM2_HOME. Нужны реальные проверки apply/confirm/rollback, таймера,
обрыва на каждой границе записи, повреждённого backup, повторных команд и прав
UID 997. Приложение SmartPlate и его `.env` в fixture не импортировать: при запуске
реального API активируются cron и Telegram polling.

После репетиции проводится отдельная проверка готовности перед установкой helper
в защищённое место на VPS. Текущий шаг не завершает пункт 1 roadmap и не даёт
оснований запускать старые одноразовые deploy-скрипты для нового релиза.

## Интеграционный PM2/systemd-стенд — 10 сценариев прошли, ресурсы остановлены

`integrated-contract.cjs`, `integrated-worker.cjs`, `integrated-rehearsal.cjs` и
`tests/integrated-contract.test.cjs` добавляют отдельный root-стенд для протокола
0.2.0 с control-envelope. Пользователь выполнил root-прогон 2026-09-11:
`/var/lib/smartplate-pm2-rehearsals/run-0314706e92e8e57f`.
Все 10 сценариев сообщили успех и `PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED`,
но bootstrap завершился ошибкой `INTEGRATED_PROTECTED_COPY` вместо маркера финальной уборки.
Первоначальный bootstrap завершился ошибкой; последующая остановка ресурсов
подтверждена независимо. Пользователь также передал содержимое обоих root-only
файлов результата после отдельной команды чтения: сценарии и уборка подтверждены.
Исходный staging: `/home/smartplate-admin/integrated-rehearsal-20260911-i5M6bz/`.
Он и защищённая копия прогона сохранены без обновления.

Причина: `finally` загрузочного файла из admin staging вызывал `stopAll()` напрямую,
а `verifyBundle()` разрешает уборку лишь из root-owned `code/`. Проверка правильно
отказала. Исправление в репозитории запускает `/usr/bin/node <run>/code/integrated-rehearsal.cjs
--cleanup <run-id>` отдельным процессом с чистым окружением; watchdog снимается лишь
после успешного возврата. Проверка защищённой копии и hashes не ослаблена.
Три регрессионных теста исполняют настоящий bootstrap/finally с подменой внешних
операций: успех, ошибка suite, ошибка cleanup с сохранением watchdog. Локально:
9/9 bootstrap/contract; весь release-набор 61 passed, 14 Linux-only skipped.
Последующий root-прогон исправленного bootstrap описан ниже.

Независимая read-only проверка 17:35–17:38 UTC: API PID 2918793, UID/GID997,
PM2 MainPID 762, публичный `/health` status/db ok; fixture workers отсутствуют.
На тот момент из units остались только inactive watchdog.service и active watchdog.timer;
таймер назначен на 17:42:37 UTC и использует правильную защищённую копию.
После команды cleanup пользователя, в 17:42:06 UTC, независимо подтверждены:
0 загруженных units и 0 timers с префиксом этого run, API PID 2918793 / UID/GID997,
PM2 MainPID 762, публичный health status/db ok. Это раньше назначенного времени watchdog.
Пользователь отдельно прочитал root-only `result.json` и `resources-stopped.json`
через Timeweb и передал вывод: `passed: true`, `cases: 10`,
`fixtureProtocolIntegrated: true`, `fixtureUid997Tested: true`,
`productionUnchanged: true`, `cleanupComplete: true`; второй файл — `complete: true`.
Это дополняет независимую проверку units, а не выводится из их отсутствия.
Ограничения результата сохранены: `modeledEvidence: ['auditZero', 'publicHealth']`,
`productionExecutionEnabled: false`, `osBootTested: false`.
`cleanupComplete` в suite result описывает уборку отдельных cases, а не завершение bootstrap.
Первый стенд убран; его первоначальная ошибка остаётся зафиксированной. Ручной
cleanup сам по себе не подтверждает исправление bootstrap; для него проведён отдельный запуск ниже.

### Проверка исправленного bootstrap — 10/10 и финальная уборка без ошибки

2026-09-11 подготовлен отдельный staging:
`/home/smartplate-admin/integrated-bootstrap-20260911-Tcp2v8/`.
Прежний staging и root-owned run сохранены без изменений. В helper изменён только
вызов финальной уборки: защищённый дочерний `--cleanup` вместо локального `stopAll`.
Новые регрессионные тесты не входят в привилегированный bundle.

- SHA-256 всех 13 переданных файлов совпали с локальными исходниками.
- Fingerprint семи helper-файлов совпал на Windows/VPS:
  `01435fff54926ce8abda1ad7f60176037cf3f52533c413728922767d0368e86a`.
- VPS preflight OK; bootstrap/contract/control-envelope/control-storage: 27/27,
  без sudo и без пропусков. Общий Windows-набор повторно: 61 passed, 14 Linux-only skipped.
- В 18:06 UTC перед подготовкой независимо проверены 0 units / 0 timers `sp-ir-*`,
  API PID 2918793 / UID/GID997, PM2 MainPID 762 и публичный health status/db ok.

Пользователь выполнил новый изолированный `run-9416adc255eb91cb`: повторены 10 сценариев
стенда, чтобы проверить именно сквозной выход через исправленный bootstrap. Это не
повтор уборки прежнего run и не production deploy; новые режимы исполнения не добавлялись.
Историческая команда Timeweb, **уже выполнена, не повторять**:

```bash
sudo /usr/bin/node /home/smartplate-admin/integrated-bootstrap-20260911-Tcp2v8/integrated-rehearsal.cjs --run 01435fff54926ce8abda1ad7f60176037cf3f52533c413728922767d0368e86a
```

В выводе пользователя появились все три маркера: `PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED`,
`INTEGRATED_PM2_REHEARSAL_OK cases=10`, `INTEGRATED_FIXTURE_RESOURCES_STOPPED`,
без последующего `FAILED`. В 18:14:32 UTC независимо подтверждены 0 units / 0 timers
`sp-ir-9416adc255eb91cb-*`, API PID 2918793 / UID/GID997, PM2 MainPID 762,
публичный health status/db ok. Пользователь отдельно прочитал через Timeweb root-only
`control/result.json` и `control/resources-stopped.json` нового run и передал вывод:
`passed: true`, `cases: 10`, `fixtureProtocolIntegrated: true`,
`fixtureUid997Tested: true`, `productionUnchanged: true`, `cleanupComplete: true`;
второй файл — `complete: true`. Проверка исправленного bootstrap и уборки завершена.
Ограничения подтверждены тем же результатом: `modeledEvidence: ['auditZero', 'publicHealth']`,
`productionExecutionEnabled: false`, `osBootTested: false`.
Boot recovery и модельные evidence этим запуском не закрываются.

Что уже проверено 2026-09-11:

- Непривилегированный preflight на VPS: `INTEGRATED_PREFLIGHT_OK`. Поддерживаются
  установленный PM2 6.0.14 и systemd 249; проверены root-owned системные исполняемые
  файлы, UID/GID 997, доступность typed D-Bus ответа и запас MemAvailable >= 512 MiB.
- Новые contract-тесты: 6/6 на Windows/VPS. Вместе с control-envelope/storage
  в новом staging: 24/24 на VPS. Они **не запускают** root-менеджер PM2 или новые
  systemd units. Общий локальный набор: 58 passed, 14 Linux-only skipped.
- Перед тестами сверены SHA-256 12 staging-файлов; после финальных правок дополнительно
  совпал fingerprint всех семи helper-модулей:
  `a27279c7d954870342a9631c88b0b0886fd61e2d87bf64674e197fbe608194c1`.

### Холодный старт: 10/10 по выводу прогона 2026-09-14

Пользователь выполнил `--boot-rehearse`: `run-e0824dc6a8402e72`, все десять
сценариев прошли. Получены `INTEGRATED_COLD_START_REHEARSAL_OK cases=10`,
`PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED` и
`INTEGRATED_FIXTURE_RESOURCES_STOPPED`. В 11:51:59 UTC независимо проверены:
0 загруженных units / 0 timers этого run, прежние API PID 2918793 (UID/GID997),
PM2 PID 762, PostgreSQL PID 721; публичный health status/db ok.
Пользователь передал root-only `control/result.json`: `passed: true`, `cases: 10`,
`coldStartRecoveryTested: true`, `productionUnchanged: true`,
`osBootTested: false`, `cleanupComplete: true`. В `resources-stopped.json`:
`complete: true`. Отчёты подтверждены; повторять запуск не нужно.

Непривилегированные
тесты release-набора: Windows 73 passed / 14 Linux-only skipped; VPS 87 passed,
0 failed / 0 skipped. Preflight VPS успешен. Fingerprint восьми helpers и SHA-256
трёх изменённых/новых тестовых файлов сверены между локальным деревом и VPS.

Staging: `/home/smartplate-admin/cold-start-20260914-jgHd8A/release/`.
Fingerprint: `3c0af3216040c422808cfbe090aa1cfe43da457f3a5184cde004c389c7442e8d`.
В комплект добавлен `startup-recovery.cjs`; старые защищённые run-копии не меняются.

Десять сценариев: prepared, arming, armed, switching, pending, confirming,
confirmed, обрыв восстановления, повреждённый журнал и повреждённый старый dump.
Перед восстановлением останавливаются только manager/timer/service данного case;
под общим flock в его журнале моделируется другая boot ID. Холодный запуск
неподтверждённой новой версии запрещён даже до истечения прежнего таймера.
Подтверждённая версия запускается только после проверки дерева и PM2 dump;
повреждение блокирует запуск, а не подменяет подтверждённый релиз старым.
После каждого сценария повторный старт проверяет неизменность терминального журнала.

Историческая команда выполненного прогона — не повторять:

```bash
sudo /usr/bin/node /home/smartplate-admin/cold-start-20260914-jgHd8A/release/integrated-rehearsal.cjs --boot-rehearse 3c0af3216040c422808cfbe090aa1cfe43da457f3a5184cde004c389c7442e8d
```

Получены `INTEGRATED_COLD_START_REHEARSAL_OK cases=10`,
`PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED` и финальный
`INTEGRATED_FIXTURE_RESOURCES_STOPPED`; result.json и resources-stopped.json
защищённой run-копии также подтверждены пользователем.

Это реальные отдельные PM2/systemd-процессы UID997, но **не перезагрузка ОС**:
`bootIdChange`, `auditZero`, `publicHealth` остаются модельными evidence;
`osBootTested: false`, `productionExecutionEnabled: false`. Системные часы и boot ID
хоста не меняются; production PM2_HOME не используется для управления. Boot service
не устанавливается. Порядок запуска служб при настоящей загрузке и production
evidence-адаптер остаются отдельными обязательными этапами.

### Границы интегрированного стенда

- Только новый `/var/lib/smartplate-pm2-rehearsals/run-<16 hex>/`, case-01…case-10,
  units `sp-ir-<16 hex>-*`. Произвольные пути, имена служб, PM2-команды и внешние
  manifest не принимаются. Предыдущие run-каталоги сохраняются.
- Helper-файлы (семь в прежнем комплекте, восемь с cold-start модулем) считываются
  один раз, сверяются с fingerprint из команды,
  затем эти же байты копируются в root-owned `code/`; таймеры используют эту копию.
  Первоначальный запуск из admin staging — явный доверенный bootstrap пользователя,
  не механизм запуска произвольного недоверенного кода с sudo.
- Root-owned `control/` с правами 700 и JSON/lock 600; код и искусственные модули
  root-owned и доступны UID997 только для чтения. Один flock на run. Worker пишет
  лишь свои ready-файлы в отдельный каталог UID997; чтение проверяет fd, владельца,
  тип и размер файла, не следует symlink последнего компонента.
- Отдельный foreground PM2 в собственной systemd cgroup и PM2_HOME. Оба искусственных
  процесса работают под UID/GID997; проверяются capabilities, cgroup, PID/starttime,
  фактическая загрузка модуля, HTTP и точная сохранённая конфигурация.
  CLI list/save требует существующего менеджера/сокетов и проверяет его PID до/после.
  Если менеджер погибнет внутри вызова и CLI попробует autostart, проверка завершится
  отказом; потомок остаётся в ограниченной cgroup вызывающего контроллера.
- Запуск кандидата отдельно через setpriv UID/GID997 с очищенными дополнительными
  группами; приложение SmartPlate, `.env`, cron, Telegram и npm не запускаются.
- Offline-откат сверяет исходное дерево/права и dump до остановки менеджера, сохраняет
  `rolling_back` до действий, восстанавливает оба dump.pm2/dump.pm2.bak и запускает
  отдельный PM2 через resurrect. Данные БД не копируются и не восстанавливаются.
- Срок часов журнала остаётся 600000 ms. Таймер задаётся абсолютным `OnBootSec` в
  шкале CLOCK_MONOTONIC (`process.hrtime.bigint`, WakeSystem=no); typed D-Bus deadline
  должен точно совпасть. Confirm требует >120 s и до реального срабатывания таймера.
  В одном сценарии таймер намеренно срабатывает раньше, через 20 s: это проверка
  раннего безопасного rollback, а не ожидание истечения десятиминутного окна.
- Отмена `arming` и терминальное решение записываются до уборки. Suite снимает таймер
  и ждёт окончания rollback-service без flock, затем записывает cleanup под lock.
  Сам rollback-service не ждёт собственного завершения. При ошибке service может
  повториться через 3 s; во время обычного восстановления таймер не снимается.
- Suite ограничен 8 минутами/256 MiB/64 tasks, каждый PM2 manager — 150 s/256 MiB/
  64 tasks/50% CPU, rollback-service — 60 s/128 MiB/32 tasks. Независимый watchdog
  через 12 минут сначала останавливает suite со всеми потомками, затем остальные
  ресурсы run. При нормальном выходе и ошибке bootstrap делает такую же уборку.
  Это teardown тестового окружения; он не является production rollback.
- Production только читается: local/public health, API PID/UID/GID, PM2 MainPID,
  SHA-256 index.js/package.json/package-lock.json до/после. Управляющие вызовы
  рабочего PM2_HOME, изменения API/БД/SSH/nginx отсутствуют.

Проверенные по выводу пользователя 10 сценариев: confirm + поздний rollback; настоящий ранний timer rollback;
обрыв после intent и после таймера; обрыв после switching и перемещения старых файлов;
обрыв после confirmed с повторным cleanup; повтор отката после остановки менеджера;
повреждённый dump без остановки здорового процесса + восстановление после исправления;
одновременные confirm/rollback под flock. Ошибка последующей уборки описана выше.

Предел доказательства даже при успехе: `auditZero` и `publicHealth` явно модельные
(`modeledEvidence` в result.json); HTTP catalog/private/sitemap проверяют искусственные
ответы fixture. Это не npm audit, не проверка публичного доступа реального приложения
и не проверка native-зависимостей production. Настоящая перезагрузка не выполняется:
`osBootTested: false`, `productionExecutionEnabled: false`. Root-owned системный boot
recovery service пока не установлен. Рабочий release helper остаётся незавершённым.

Историческая команда первого прогона — **уже выполнена, не повторять**:

```bash
sudo /usr/bin/node /home/smartplate-admin/integrated-rehearsal-20260911-i5M6bz/integrated-rehearsal.cjs --run a27279c7d954870342a9631c88b0b0886fd61e2d87bf64674e197fbe608194c1
```

Для подтверждения нужны все три строки: `PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED`,
`INTEGRATED_PM2_REHEARSAL_OK cases=10`, `INTEGRATED_FIXTURE_RESOURCES_STOPPED`.
После этого отдельно проверить result.json, состояние units и production.
При ошибке не повторять запуск; сохранить `INTEGRATED_REHEARSAL_DIRECTORY` и вывод.
Диагностика в root-only `control/result.json`, `control/last-command-error.json`,
case `control/last-action.json` и systemd journal. Содержимое этих файлов не
публиковать автоматически. До оценки результата остаёмся на Astra High.

Для справки: пользователю была передана команда уборки из неизменённой защищённой
копии (только этот run, не новый прогон). После неё отсутствие units подтверждено;
повторять команду сейчас не нужно:

```bash
sudo /usr/bin/node /var/lib/smartplate-pm2-rehearsals/run-0314706e92e8e57f/code/integrated-rehearsal.cjs --cleanup run-0314706e92e8e57f
```

У этой версии `--cleanup` нет строки успеха: затем отдельно проверить отсутствие
активных units/workers, root-only результат уборки и здоровье production.

Основание выбора часов: [systemd 249 timer](https://github.com/systemd/systemd/blob/v249/man/systemd.timer.xml)
и [libuv CLOCK_MONOTONIC](https://github.com/libuv/libuv/blob/v1.46.0/src/unix/linux.c).

## Единый журнал state/recovery — подготовительный шаг 2026-09-11

`control-envelope.cjs` соединяет состояние протокола 0.2.0, recovery-record и
последний исходный замер часов в один JSON. Это чистая модель журнала, без
запуска PM2/systemd и без production CLI. Схема envelope — `1`; версии
протокола, state и recovery не меняются. Старые раздельные файлы автоматически
не преобразуются. Проверяются привязка к manifest, точные поля и согласованность
вложенных значений. Повреждение записи требует остановки и диагностики.

Порядок для будущего адаптера под одним общим `flock`:

1. Прочитать envelope и проверить ожидаемый manifest и `generation`.
2. Проверить preflight, записать `intend-arm` целиком через atomic rename и fsync
   файла/каталога. Состояние протокола пока `prepared`, стадия envelope — `arming`.
   Два десятиминутных deadline уже закреплены; `generation` меняется независимо
   от ещё нулевой ревизии протокола.
3. Не отпуская lock, создать таймер с исходным deadline, проверить его и вновь
   собрать arm-evidence. Только непрерванный контроллер может выполнить `arm`.
   Он сохраняет `active` с состоянием `armed` и той же recovery-record одним
   атомарным обновлением. Задержка запуска таймера не продлевает deadline.
4. При перезапуске контроллера стадия `arming` всегда выбирает `cancel-arm`.
   Записать `cancelled` до остановки таймера. Повторно включать таймер или
   продолжать `arm` из диска запрещено; изменение файлов допускается только
   после сохранённого `armed` и затем `switching`.
5. Отдельный контроллер останавливает таймер, освобождает lock, дожидается выхода
   rollback-service, повторно берёт lock и записывает `cancel-cleanup` с реальными
   `timerStopped`/`rollbackServiceInactive`. Нельзя ждать сервис под lock или
   ждать собственного выхода. Отменённая операция не используется заново.

Эти требования к lock, источнику часов, порядку вызовов и timer-evidence обязан
обеспечить адаптер: чистая функция сама их не проверяет. API `update()` требует
`expectedGeneration` и manifest digest; `decision()` выбирает восстановление.
В `active` прямые действия вызывают исходный протокол, recovery-действия —
`recoveryTransition`. Подтверждение требует запаса > 120 секунд на **обоих**
часах. Регресс монотонного времени после последнего сохранённого действия
запрещает продолжение. Исходный замер сохраняется отдельно от нормализованного
`lastNowMs`. Терминальное решение и повторный cleanup сохраняют идемпотентность.

Проверки этого шага:

- `tests/control-envelope.test.cjs`: 11/11 локально и на Linux.
- `tests/control-storage.test.cjs`: 7/7 на VPS. Искусственный дочерний writer
  вызывает настоящий `atomicJson` под `/usr/bin/flock --exclusive --close`.
  SIGKILL вводится после частичной записи временного файла, fsync файла, до/после
  rename и после fsync каталога. Дополнительно проверяются ошибки обоих fsync,
  гонки arm/cancel и commit/rollback, обрывы cancel/commit, повторный cleanup,
  повреждённые/отсутствующие файлы и отказ для links/неподходящих прав.
- Новые тесты на VPS: 18/18, UID пользователя `smartplate-admin`; все восемь
  загруженных файлов предварительно сверены по SHA-256 с локальными.
  Staging: `/home/smartplate-admin/control-envelope-20260911-ZP5ukU/`.
  17 малых каталогов `/tmp/sp-control-test-XXXXXX/` сохранены для диагностики;
  их точные имена выведены как `CONTROL_TEST_DIRECTORY`.
- Общий локальный набор шести test-файлов: 52 passed, 14 Linux-only skipped,
  0 failures. Полный набор из 66 тестов на VPS в этом шаге не запускался.

```text
node --test server/ops/release/tests/control-envelope.test.cjs server/ops/release/tests/control-storage.test.cjs
```

Предел доказательства: evidence тестов модельное, включая флаги PM2/UID997/health
и завершения timer-cleanup. Реальны файловые операции, fsync, flock и SIGKILL
только тестовых дочерних процессов. Тестовый writer принимает лишь приватные
каталоги `/tmp/sp-control-test-XXXXXX/`, не является production-хранилищем и не
импортируется в адаптер. PM2, systemd, API, БД и сеть в этих тестах не вызываются.
SIGKILL не моделирует потерю питания: видимая после rename запись ещё не доказывает
её сохранность после сбоя диска, если fsync каталога не завершился. Ошибка fsync
не возвращает успех; контроллер обязан остановить дальнейшие действия.

Продолжение этого шага — подготовленный выше интеграционный root-стенд; его
привилегированный прогон ещё ожидается. Для запуска и оценки результата остаёмся
на Astra High. Boot recovery требует отдельной проверки. Пункт 1 roadmap остаётся
открытым; рабочий helper ещё не готов к релизу.

## Изолированная конфигурация PM2 — выполнено 2026-09-10

`pm2-sandbox.cjs`, `pm2-fixture-worker.cjs`, `pm2-rehearsal.cjs` и
`tests/pm2-sandbox.test.cjs` добавляют **непривилегированный подготовительный
стенд**. Он проверяет установленный PM2 `6.0.14` через отдельный `PM2_HOME`.
Протокол 0.2.0/recovery проверяется отдельными unit-тестами; PM2-прогон ещё не
интегрирует его события с evidence ОС. `savedPm2997`, реальные API/access checks,
таймер rollback, SIGKILL на границах протокола и boot recovery этим прогоном
не доказаны. `result.json` явно содержит `protocolIntegrated: false`,
`uid997Tested: false`, `osBootTested: false`.

Границы стенда:

- Только UID/GID `1000` (`smartplate-admin`); запуск через sudo/root отклоняется.
  Новый приватный `/tmp/sp-pm2-rh-XXXXXX/`, отдельные HOME/PM2_HOME, копии helper
  с хешами, логи, конфигурация и checkpoint. Успешные и неуспешные каталоги
  сохраняются для диагностики; production checkpoints не используются.
- Искусственный HTTP-процесс и контрольный процесс, только loopback и случайные
  порты. Приложение SmartPlate, его `.env`, cron и polling не импортируются.
- Для каждого вызова PM2 создаётся новое окружение без наследования переменных
  вызывающей оболочки. Команды ограничены start двух точных конфигураций,
  jlist/save/resurrect, delete точного тестового приложения и kill **собственного**
  менеджера. Рабочий `/root/.pm2` не используется для управления.
- Пользовательский transient systemd service: `RuntimeMaxSec=180s`,
  `MemoryMax=256M`, `TasksMax=64`, `CPUQuota=50%`, `NoNewPrivileges=yes`,
  `KillMode=control-group`, `TimeoutStopSec=10s`, `SendSIGKILL=yes`.
  Startup hooks, linger, системные units и настройки рабочего PM2 не меняются.
  Отдельный срок жизни worker — 150 секунд, autorestart выключен.
- Production только читается: PID/UID/GID API, PID рабочего PM2, local/public
  health и SHA-256 `index.js`, `package.json`, `package-lock.json`.

Результат:

- Staging: `/home/smartplate-admin/pm2-config-rehearsal-20260910-uHySOB/`.
- Успешный run: `/tmp/sp-pm2-rh-qtuXZ9/`, 5/5 сценариев:
  сохранение двух конфигураций; resurrect после остановки тестового менеджера;
  смена конфигурации приложения с сохранением PID контрольного процесса;
  отказ при повреждённом checkpoint без остановки процессов; offline-возврат
  исходной конфигурации. При восстановлении проверяются байты и права `600`;
  до resurrect возвращаются оба файла `dump.pm2` и `dump.pm2.bak`, чтобы fallback PM2
  не выбрал другую версию. npm и установка пакетов не используются.
- Получены `PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED`,
  `ISOLATED_PM2_CONFIG_REHEARSAL_OK cases=5`, `ISOLATED_PM2_USER_UNIT_INACTIVE`.
- Независимо проверено 2026-09-10 21:29 UTC: baseline-файлы совпадают, 0
  загруженных user units `sp-pm2-rh-*`, нет тестовых процессов UID 1000,
  рабочий PM2 PID `762`, публичный health/DB OK. Это снимок проверки,
  а не гарантия текущего состояния.
- Повторная проверка 2026-09-11 07:42 UTC: все десять файлов staging совпали с
  локальными SHA-256, полный VPS-набор прошёл 48/48 без пропусков; API PID
  `2918793` сохранил UID/GID `997`, PM2 PID остался `762`, публичный health/DB OK.

Первый run `/tmp/sp-pm2-rh-GuY93Y/` завершился отказом проверки PID-пути,
с успешной уборкой и неизменным production baseline. По установленному коду
`PM2/lib/God.js` подтверждено: PM2 добавляет `-pm_id` в имя PID-файла; при save
`lib/API/Startup.js` удаляет поля `pm_id` и `instances`. Валидатор и тесты
исправлены под этот формат с сохранением ограничений каталога, роли и числа
процессов. Старый run сохранён и не переписывался.

Для справки, уже выполненная команда (повторять без причины не нужно):

```text
node /home/smartplate-admin/pm2-config-rehearsal-20260910-uHySOB/pm2-rehearsal.cjs --run
```

Основание для изоляции и восстановления:
[отдельные PM2_HOME](https://doc.pm2.io/en/runtime/features/multiple-pm2/) и
[save/resurrect](https://pm2.keymetrics.io/docs/usage/startup/).
Следующий этап требует Astra High: интеграция протокола, timer/cleanup,
защищённого состояния и UID 997. Репетиция настоящей перезагрузки должна идти
в отдельной тестовой среде, не через перезапуск production VPS.

## Linux-репетиция v1 — выполнена 2026-09-10

`linux-rehearsal.cjs`, `linux-storage.cjs` и `fixture-worker.cjs` — отдельный
**испытательный стенд, а не production-deploy helper**. Предварительные тесты
`tests/linux-storage.test.cjs` вместе с protocol-тестами прошли на VPS без sudo:
21/21, без пропусков. Пользователь выполнил root/systemd прогон через Timeweb:
`LINUX_RELEASE_REHEARSAL_OK cases=13`.

### Зафиксированный результат

- Код стенда: commit `38a9d12130243829e08069a54b64cdc843323a00`.
- Каталог результатов: `/var/lib/smartplate-release-rehearsals/run-4fcb2d7b5531a74c`.
- По переданному пользователем выводу прошли все 13 сценариев и проверка
  `PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED`. Root-only файлы результатов через
  SSH без sudo отдельно не читались.
- Независимая read-only проверка 2026-09-10 16:40 UTC: 0 загруженных units и
  0 timers с префиксом `sp-rh-4fcb2d7b5531a74c-`, API PID `2918793`,
  PM2-manager PID `762`; публичный `/health` вернул status/db `ok`.
- Тестовые файлы сохранены для диагностики; повторный запуск не требуется.

Границы стенда:

- Создаёт только `/var/lib/smartplate-release-rehearsals/run-<random>/` и
  временные units `sp-rh-<random>-*`; старые данные не удаляет и не заменяет.
- В root-owned папку копируется проверяемый по SHA-256 комплект. Таймер и
  дочерние команды исполняют эту копию, не файлы из домашнего каталога admin.
- Искусственный HTTP-процесс использует UID/GID 997, нулевые capabilities,
  случайный loopback-порт и только фиктивный модуль `release-fixture`.
  Приложение SmartPlate, `.env`, cron, Telegram и npm не запускаются.
- Один реальный `flock` на весь прогон; атомарная запись состояния с fsync;
  восстановление из заранее проверенного дерева с исходными режимами/владельцами.
  Ограничения дерева (малые файлы, нет симлинков/hardlinks) относятся к fixture;
  копирование настоящего `node_modules` требует отдельного адаптера и тестов.
- 13 сценариев: обычное подтверждение, реальный таймер, SIGKILL на четырёх
  границах apply и трёх rollback, обрыв в двух точках confirm, повреждённый backup,
  одновременный confirm/rollback. Убитые процессы — только дочерние контроллеры
  стенда. Они не являются API или PM2.
- Каждый worker ограничен 180 секундами и 96 MiB; весь suite — отдельная cgroup,
  до 4 минут и 256 MiB. Независимый cleanup-таймер через 10 минут сначала
  останавливает suite вместе с дочерними командами, затем остальные units стенда.
  При штатном завершении очистка выполняется сразу, без ожидания таймера.
- Production только читается: health, PID/UID/GID API, PID PM2-manager и хеши
  `index.js`, `package.json`, `package-lock.json` до/после. Нет рестартов API,
  изменений БД, SSH, nginx, `.env`, sitemap или production `node_modules`.

Стенд v1 намеренно не вызывает `transition()` протокола: production evidence-адаптер
ещё не реализован. На стенде проверялась более узкая механика файлов/таймера.
В fixture решение `confirmed` сохраняется под lock **до** остановки таймера;
уже поставленный в очередь rollback читает терминальное решение и ничего не
переключает. Прерывание в `confirming` остаётся откатываемым. Это отличается от
чернового gate `timerStopped` в 0.1.0. В 0.2.0 протокол приведён к этому порядку
и дополнен отдельным состоянием завершённости уборки. Это изменение пока проверено
локально: 17/17 protocol-тестов; общий Windows-прогон 19 passed, 7 Linux-only skipped.
Результат 13/13 выше относится только к прежнему стенду, не к интеграции 0.2.0.
Интеграция boot/clock recovery и операций PM2 с протоколом, а также связь evidence
с проверками ОС остаются задачей адаптера и следующей изолированной репетиции.

### Команда выполненного прогона (для справки, не повторять)

Предварительно комплект передан в
`/home/smartplate-admin/release-rehearsal-20260910-v1/`; SSH использует сохранённый
ключ сервера с `StrictHostKeyChecking=yes`. Не запускать старый dependency helper.

```bash
sudo /usr/bin/node /home/smartplate-admin/release-rehearsal-20260910-v1/linux-rehearsal.cjs --run
```

Ожидаемый конец: `PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED` и
`LINUX_RELEASE_REHEARSAL_OK cases=13`. Отдельного confirm здесь нет: это тест.
Если появилась `LINUX_RELEASE_REHEARSAL_FAILED`, не повторять команду и не
запускать production rollback. Передать вывод и `REHEARSAL_DIRECTORY` для
диагностики. Точные файлы/журналы стенда сохраняются для разбора.

Даже успешный прогон не доказывает готовность настоящего релиза: отдельно нужны
интеграция с протоколом, установка зависимостей и их загрузка UID 997 (включая
bcrypt), интегрированная PM2/boot-репетиция, проверки
API-доступа и production checkpoint. Пункт 1 roadmap остаётся открытым.
