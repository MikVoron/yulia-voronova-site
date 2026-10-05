# Разделённое восстановление запуска — 2026-10-04

Статус: изолированная Linux/systemd репетиция **пройдена 2026-10-05, 10/10**.
Production-адаптер не установлен, `productionExecutionEnabled: false` и
`osBootTested: false`. Файлы предыдущих защищённых run не обновляются.

`boot-controller.cjs` выполняет offline prepare и post-start отдельно. Проверки
в изолированном PM2/systemd пространстве подключены через `bootPorts()`;
`plan.cjs` по-прежнему принимает только `--plan`. Эта репетиция не доказывает
полную политику production PM2, готовность БД или реальные business flows.

## Состав проверяемого пакета

Fingerprint `integrated-rehearsal.cjs --bundle-hash` охватывает 12 файлов в порядке
`integrated-contract.cjs:HELPERS`:

```text
integrated-contract.cjs
integrated-rehearsal.cjs
integrated-worker.cjs
protocol.cjs
recovery-policy.cjs
control-envelope.cjs
linux-storage.cjs
startup-recovery.cjs
boot-state.cjs
boot-controller.cjs
boot-fixture-units.cjs
boot-rehearsal.cjs
```

Исходники передаются в новый admin staging после согласования точного комплекта.
Текущий локальный fingerprint:
`ffaffb2a3b1b3d5593140cede7fc50d4dbbcd7fac50b0f961a0865e36029ad42`.
Согласованный staging: `/home/smartplate-admin/startup-recovery-20261004-9130ffda/`.
Root bootstrap сверяет fingerprint, переносит эти байты в новую защищённую run
копию, затем проверяет каждый файл перед действиями. Службы/PM2_HOME находятся
в namespace `sp-ir-<run>-case-*` / `/var/lib/smartplate-pm2-rehearsals/run-*`.

Прогон поддерживает только systemd 249, PM2 6.0.14, UID/GID997 и минимум 512 MiB
свободной памяти; drift версии приводит к отказу preflight. Фиксированный CLI:

```text
sudo /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/node <approved-staging>/integrated-rehearsal.cjs --startup-rehearse <verified-bundle-SHA256>
```

Это шаблон, не готовая команда: staging и SHA будут указаны после сверки VPS.

## Проверки suite

| Case | Исходная фаза | Проверяемый результат |
|---|---|---|
| 01 | prepared | Отказ при потере/порче pointer; ручной и автоматический restart создают свежий receipt |
| 02 | arming | Устойчивый cancel и cleanup; arming не завершается |
| 03 | armed | old, затем реальные fixture evidence и restored |
| 04 | switching | old после незавершённого переключения |
| 05 | pending | 8 offline SIGKILL; блокировка release-команд; SIGKILL после restored |
| 06 | confirming | Модель другого boot ID; HTTP 503 не завершает rollback; успешный повтор |
| 07 | confirmed | Порча primary dump блокирует запуск; после исправления стартует new |
| 08 | rolling_back | SIGKILL после finalizing; автоматический повтор сохраняет old |
| 09 | rolled_back | SIGKILL после cleanup; повтор подтверждает old |
| 10 | pending | SIGKILL после verified; новая попытка запуска проверяет old заново |

Восемь offline границ: gate, решение rollback/cancel, подготовка копии, перенос
старого live, установка live, primary dump, fallback dump, receipt. Четыре
post-start границы: finalizing, restored, cleanup, verified.

Root-owned `active.json` обязателен даже до первого переключения. Отсутствие
указателя блокирует запуск; явный idle с проверенным baseline реализован в чистой
схеме и проверен локально, но initial production idle ещё не установлен.

Два dump содержат всю выбранную fixture-конфигурацию, включая sentinel; проверяются
определения обоих процессов, SHA сохранённого старого dump, tree и байтовое равенство
primary/fallback. Полная проверка production окружения остаётся отдельной задачей.

Подготовка требует уже остановленных rollback timer/service. Suite останавливает
их перед стартом; ручной/автоматический restart case 01 проверяется в `prepared`
без вооружённого таймера. Оркестрация runtime restart при ещё активном rollback
controller требует отдельной интеграции вне удерживаемого flock до production.

`Requires`+`After` проверяются настоящим стартом manager при неисправном prepare.
`ExecStartPre` повторяет prepare и при автоматическом `Restart=on-failure`.
`ExecStartPost` проверяет health, UID/GID/capabilities, PID/starttime, доступ,
сохранённую конфигурацию и stopped rollback-ресурсы. Порядок опирается на
[unit semantics systemd v249](https://github.com/systemd/systemd/blob/v249/man/systemd.unit.xml)
и [service semantics](https://github.com/systemd/systemd/blob/v249/man/systemd.service.xml);
его фактическое подтверждение получено в изолированном Linux-прогоне ниже.

## Результаты и уборка

### Первая попытка и исправление — 2026-10-05

Run `run-4eac38c9ca3c1952` завершился с `INTEGRATED_BOOT_UNIT_NOT_LOADED`
до первого сценария. В журнале первоначальный transient PM2 запустился и
остановился штатно; `INTEGRATED_FIXTURE_RESOURCES_STOPPED` получен. Значения
`Transient`/`FragmentPath` прежняя проверка не сохраняла, поэтому точная ветка
отказа по журналу не установлена. Успех suite и неизменность production этим
неудачным прогоном не подтверждены.

Исправление разделяет transient `*-manager.service` и runtime
`*-boot-manager.service`, сохраняет выбор в защищённом fixture config и
останавливает оба имени при уборке, включая частичную установку. Загрузка
обоих runtime units требует `LoadState=loaded`, `Transient=no`, root-owned
symlink с точной целью и ожидаемые байты источника. `FragmentPath` допускает
только этот источник или известный runtime symlink с тем же realpath;
произвольные aliases не принимаются. Наблюдения сохраняются до проверок в
`case-*/control/boot-unit-observation.json`.

Локально: 134 теста, 120 passed, 14 Linux-only skipped, 0 failed. Новые тесты
исполняют настоящие функции установки/выбора/уборки с заменой внешних границ,
проверяют оба допустимых пути, отказы и сохранение диагностики. Новый VPS
прогон первого исправления описан ниже; actual OS boot и production installation не разрешены.

### Вторая попытка: отказ зависимости и reset — 2026-10-05

Run `run-9343a94d58e883d3` прошёл загрузку runtime units, но завершился с
`COMMAND_FAILED_systemctl` после первого намеренного удаления `active.json`.
В 08:35:57 UTC prepare отказал с `ENOENT`, manager не стартовал из-за dependency.
Указатель восстановлен в исходный `open`, то есть suite дошёл до сброса состояния;
первая настоящая подготовка не началась. Cleanup подтверждён. Старый общий
`last-command-error.json` затёрт ожидаемой ошибкой остановки ещё не запущенного
watchdog service; stderr исходного сбоя утрачен, точный ответ reset не сохранён.

Сброс выполняется по одному имени; только точный `Unit ... not loaded.` от
`reset-failed` для заранее проверенной inactive службы с status=1 без OS-error
допускается. Сброс inactive loaded служб сохраняется для очистки start-limit;
ошибки прав, timeout и исчезновение failed-службы не подавляются. Это учитывает
[ResetFailedUnit systemd v249](https://github.com/systemd/systemd/blob/v249/src/core/dbus-manager.c#L670),
который сам не подгружает unit. Локально реальный первый цикл suite проходит
оба намеренных отказа и доходит до healthy launch при моделируемой выгрузке.

Fatal command получает структурированную `commandFailure`, сохраняемую в
result.json и выводимую bootstrap как `INTEGRATED_SUITE_COMMAND_ERROR`.
Разрешённые ошибки пишутся в `last-allowed-command-error.json`, не затирая
`last-command-error.json`. Локально: 140 тестов, 126 passed, 14 Linux-only
skipped, 0 failed. Linux-прогон этого исправления описан ниже.

### Третья попытка: доверенный health fault path — 2026-10-05

Run `run-ae1752539590c467` прошёл pointer refusal, ручной и автоматический
restart, arming, armed, switching и все offline crash boundaries. Далее
получен `UNTRUSTED_PATH`, cleanup подтверждён; весь suite ещё не пройден.

В case 06 health fault создавался в UID997-owned `runtime`, затем читался
через root-only `readBytes`, проверяющий владельца всей цепочки пути. Это
несовместимо с `protectedPath`, даже когда сам файл создан root. Флаг теперь
задан общим `layout.healthFlag` в root-owned 0755 case directory: root-файл
0644 доступен worker UID997 для чтения, но parent не доступен ему для записи.
Worker и suite используют один путь; проверки `protectedPath` не изменены.

Добавлены регрессии настоящего protectedPath (UID997 и writable parents
отклоняются), настоящего case-06 handler (503, закрытый recovery, удаление
флага и успешный retry) и настоящего worker HTTP handler (200/503/200;
файл в worker-owned runtime не может инжектировать отказ). Локально:
143 теста, 129 passed, 14 Linux-only skipped, 0 failed. Новый Linux-прогон
описан ниже; production installation и OS boot по-прежнему не выполнены.

### Успешная репетиция — 2026-10-05

Пользователь выполнил утверждённый bootstrap в staging выше с fingerprint
`ffaffb2a3b1b3d5593140cede7fc50d4dbbcd7fac50b0f961a0865e36029ad42`.
Все 12 исходников предварительно сверены по SHA-256 на VPS, syntax/preflight OK.
Run: `/var/lib/smartplate-pm2-rehearsals/run-40e2327ea17efeeb`.

Получены все десять success-маркеров, затем
`PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED`, `SPLIT_START_REHEARSAL_OK cases=10`
и `INTEGRATED_FIXTURE_RESOURCES_STOPPED`. Пользователь отдельно прочитал root-only
`control/result.json` и `control/resources-stopped.json`; подтверждены:

```json
{
  "passed": true,
  "cases": 10,
  "splitStartupTested": true,
  "unitOrderingTested": true,
  "manualRestartTested": true,
  "automaticRestartTested": true,
  "offlineCrashBoundaries": 8,
  "postStartCrashBoundaries": 4,
  "fixtureUid997Tested": true,
  "modeledEvidence": ["publicHealth", "bootIdChange"],
  "productionExecutionEnabled": false,
  "productionUnchanged": true,
  "osBootTested": false,
  "cleanupComplete": true
}
```

`resources-stopped.json`: `complete: true`. Этап изолированной репетиции закрыт;
повторять этот запуск не требуется. Это не полная production PM2 policy,
не production installation, не business-flow тест и не реальная загрузка ОС.

При успехе требуются `SPLIT_START_REHEARSAL_OK cases=10`, затем
`INTEGRATED_FIXTURE_RESOURCES_STOPPED`. В `control/result.json` должны быть true:
passed, splitStartupTested, unitOrderingTested, manualRestartTested,
automaticRestartTested, productionUnchanged, cleanupComplete. Дополнительно
`offlineCrashBoundaries: 8`, `postStartCrashBoundaries: 4`, `cases: 10`.
В `control/resources-stopped.json` — `complete: true`.

Cleanup останавливает suite, timers, managers, helpers и удаляет только созданные
runtime symlink unit-файлов, проверяя точный target и исходные байты. Копии units,
journal, receipt и диагностические файлы сохраняются в run. Watchdog остаётся
вооружённым при отказе protected cleanup. Production PID/файлы/health сверяются
до/после; их совпадение не означает проверку загрузки production ОС.

`publicHealth` (локальный искусственный HTTP) и `bootIdChange` (только запись
fixture-журнала) явно модельные. Системные часы/boot ID не меняются. Linux suite
не подключается к production БД и не перезагружает ОС.
