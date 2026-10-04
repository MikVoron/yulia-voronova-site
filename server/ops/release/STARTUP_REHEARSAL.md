# Разделённое восстановление запуска — 2026-10-04

Статус: код и локальные тесты готовы; новый Linux/systemd прогон **ожидается**.
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
`9130ffda5b1c0832dff7451162f74e778282b54350d1084419d01e0e6b54949a`.
Предлагаемый новый staging: `/home/smartplate-admin/startup-recovery-20261004-9130ffda/`.
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
его фактическое подтверждение ожидает новый Linux-прогон.

## Результаты и уборка

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
