# Восстановление API при старте PM2: проект, обновлён 2026-10-05

Статус: проект следующего адаптера. Production boot service не реализован и не
установлен. Проверка реальной загрузки ОС остаётся открытой. Реализован отдельный
read-only наблюдатель `production-observe.cjs`; после явного согласия пользователя
два модуля переданы на VPS и --observe успешно выполнен 2026-09-20 08:18:34 UTC.
Root-only PM2 inventory получен от пользователя в 08:47:35 UTC; основные поля
primary/fallback корректны, но полные файлы различаются. Сравнение 08:53:27 UTC
показало четыре различия: created_at, pm_uptime, restart_time и одно неизвестное
поле. Известные launch/environment параметры равны. Уточняющий наблюдатель
распознаёт стандартные поля instrumentation PM2 и считает различия метрик без
вывода имён/значений. Его тесты 22/22, VPS syntax/hash проверены; текущий bundle:
`57579f3d69a0f9a8959d01be2678ad594c0268f5d45dedcdc7781a0bbe4f4909`.
Root-only отчёт обновления получен от пользователя за 09:00:41 UTC: четвёртое
поле — `axm_monitor`. Состав и определения 10 метрик совпадают, изменились
только значения 8. Других отличий нет (`unclassifiedFieldCount: 0`), известные
поля запуска и окружение равны. Это объясняет разные хеши PM2 dump без изменения
зафиксированных в них параметров запуска; full savedPm2997 policy всё ещё открыта.
Итоговый Windows release-набор: 95 passed, 14 Linux-only skipped, 0 failed.

Обновление 2026-10-04: реализованы чистый `boot-controller.cjs`, схема устойчивого
шлюза `boot-state.cjs` и OS-адаптер в фиксированном пространстве fixture. Подготовлен
режим `--startup-rehearse` с настоящими runtime unit-файлами systemd, отдельным
PM2_HOME и двумя процессами UID997. **Linux-прогон завершён 2026-10-05, 10/10**:
`run-40e2327ea17efeeb`, root-only result/cleanup JSON подтверждены пользователем;
unit ordering, ручной/автоматический restart, 8 offline и 4 post-start SIGKILL
границы пройдены. Production unchanged, cleanup complete; publicHealth/bootIdChange
модельные, actual OS boot не проверялся. Windows-набор: 129 passed, 14 skipped.
Production-пути и unit `pm2-root.service` к этому контроллеру не подключены.
План прогона и границы проверок: [STARTUP_REHEARSAL.md](STARTUP_REHEARSAL.md).

## Проверенная исходная конфигурация

Read-only SSH-проверка 2026-09-20 08:04 UTC: systemd 249; `pm2-root.service`
active, Type=forking, MainPID=762, PIDFile=/root/.pm2/pm2.pid,
ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect. Drop-ins отсутствуют.
After содержит network.target, но не PostgreSQL. PostgreSQL PID721 active,
nginx PID3118465 active, public health status/db ok. Следующим чтением `ps -u 997`
подтверждён API PID3164825, PPID762, UID/GID997. Старый PID2918793 из репетиции
2026-09-14 больше не является текущим baseline.

Новый наблюдатель подтвердил восемь HTTP/процессных проверок: 94 рецепта
(41 free, 25 trial, 28 pro), корректный гостевой доступ, 401 на трёх приватных
маршрутах с обоих origins, sitemap 114 URL с покрытием всех 94 рецептов, UID/GID997,
нулевые capabilities API и совпадение снимков до/после. Fingerprint двух модулей
локально и на VPS: `79c7edd9154e393b2d7066c397fbaa4cd2b301405aa59419521fef76d0cdb2f3`.
PM2-файлы из /root/.pm2 этим непривилегированным запуском не читались.
Последующий root-only отчёт показал по одному smartplate-api в primary/fallback,
script/cwd/UID997/GID997/fork/autorestart/interpreter проверки true. Хеши различны:
primary `747f9485f9340ed5d14e806da0181e37998f82f8630d3dac5712d0cd9a04ddf1`,
fallback `fa9a48bee59c1de1111a4838fb8c5cecbb9642a2babed062253c9db98ab13dcb`.
Установленный PM2 при save копирует предыдущий primary в backup (Startup.js,
строки 472–482); разные хеши сами по себе не доказывают ошибку. Новое сравнение
покажет семантические различия, не раскрывая значения окружения или аргументов.
Даже metadata-only результат не является полной проверкой политики savedPm2997.

## Порядок восстановления

1. **Offline prepare до PM2.** Под глобальным release flock прочитать защищённый
   указатель активного релиза, journal и manifest. Проверить отсутствие живого
   менеджера и процессов API. Сверить ожидаемые файлы и сохранённую конфигурацию,
   выбрать old/new по устойчивому решению, завершить файловое восстановление.
   Этот шаг не запускает PM2 и не ожидает HTTP, nginx, DNS или PostgreSQL.
2. **PM2 resurrect.** systemd запускает менеджер после успешного prepare.
   Два PM2 dump должны содержать одну выбранную и проверенную конфигурацию всех
   управляемых процессов. Нельзя потерять соседний процесс при восстановлении API.
3. **Проверка после старта.** Отдельный контроллер с ограниченными ожиданиями
   проверяет PID/starttime, UID/GID, capabilities, файл dump, local/public health,
   гостевой каталог, приватные маршруты и sitemap. Только затем допустим переход
   `restored` и уборка. Неуспех не разрешает подтвердить кандидат или завершить cleanup.

Существующий fixture `startupRecovery()` нельзя подключить как ExecStartPre:
его rollback сам запускает PM2 и ждёт health. Адаптер необходимо разделить на
offline-часть и проверку после старта, сохранив протокол 0.2.0.

Планируемая зависимость PM2 — одновременно `Requires=` и `After=` на prepare.
Одного `Before=` недостаточно для блокировки PM2 при отказе подготовки. Проверку
наличия обязательного журнала следует выполнять внутри helper с ненулевым exit,
а не через ConditionPathExists: невыполненное условие службы не эквивалентно
ошибке её запуска. Семантика проверена по
[документации systemd v249](https://github.com/systemd/systemd/blob/v249/man/systemd.unit.xml).

Prepare должен выполняться заново при каждом запуске менеджера. Не использовать
RemainAfterExit=yes, которое могло бы оставить старое успешное решение активным.
Проверку HTTP не включать в предшествующую PM2 зависимость. PostgreSQL/nginx
учитываются только на стадии последующей проверки. Конкретные unit-файлы ещё
требуют теста настоящей systemd-транзакции на изолированных именах. В новых fixture
unit-файлах `Requires`/`After` обеспечивают зависимость, а `ExecStartPre` дополнительно
повторяет offline prepare при каждом старте, включая автоматический `Restart=`.
Проверка после старта идёт через ограниченный по времени `ExecStartPost`; её отказ
сохраняет закрытый шлюз и приводит к остановке cgroup менеджера.

## Устойчивое состояние и обрывы

| Сохранённое решение | Offline prepare | После старта |
|---|---|---|
| prepared / cancelled | проверенная old-конфигурация | health, повторяемая уборка где применима |
| arming | записать cancel, затем проверить old | health и cancel-cleanup |
| armed / switching / pending / confirming / rolling_back | сохранить rolling_back и восстановить old | реальные evidence, restored, cleanup |
| confirmed | сверить выбранную new-конфигурацию | сверить health; не заменять new на old |
| rolled_back | сверить выбранную old-конфигурацию | health и повтор cleanup |
| повреждённый / исчезнувший обязательный журнал | отказ запуска | диагностика |

Нужна дополнительная защищённая запись завершённого offline prepare, связанная с
release ID, manifest digest, generation, выбранной версией, dump/tree hash и boot ID.
Она не должна подменять `restored`, которому нужны живые evidence. Схема v1
реализована в `boot-state.cjs`: `active.json` хранит identity релиза, уникальный
attempt со снимком часов, receipt с точным журналом (включая generation), выбранной
версией и хешами tree/dump. Между prepare и последующей проверкой новый релиз
блокируется статусами `preparing` / `prepared` / `finalizing`.

После живых проверок записывается `finalizing` со снимком часов и хешем PID/starttime
менеджера и обоих workers. Из этой записи вычисляется точная последовательность
`restored`/cleanup; обрыв между отдельными fsync-записями повторяем. Повтор сначала
сверяет процесс и evidence, затем допускает только журнал из этой последовательности.
Статус `verified` записывается последним. Новая попытка offline prepare возможна
только после проверки отсутствия менеджера/workers и rollback-ресурсов.

Первый старт без активного релиза требует явного root-owned состояния `idle`.
Отсутствие произвольного файла не означает idle: иначе потеря active pointer
позволила бы запустить частично переключённую версию. Установка создаёт исходное
idle-состояние лишь после проверки актуальной production-конфигурации.

## Реальные evidence: выполненная часть

Наблюдатель использует только фиксированные GET endpoints. Он проверяет оба
health, все гостевые рецепты (включая free и restricted), ограничение тизера,
401 на /auth/me, /plate, /plate/history и покрытие каталога sitemap. Обход редиректов
запрещён, TLS проверяется стандартным HTTPS-клиентом, запросы ограничены 5 секундами
и 8 MiB. Снимки до/после проверяют PID/starttime, boot ID, UID/GID/capabilities,
PM2 service cgroup и хеши index.js/package-файлов.

`--inspect-pm2 <bundle SHA256>` дополнительно читает root-only pid/dump/fallback;
проверяет владельца, права и тип файлов; выводит только закрытую проекцию
определений и хеши. Он не вызывает CLI PM2, не загружает код приложения или `.env`.
Поля окружения и произвольные аргументы не выводятся. Равенство primary/fallback
показывается как факт, но ещё не означает полную валидацию политики PM2.

`passed` относится только к наблюдению. Поля `releaseAuthorized: false`,
`productionExecutionEnabled: false`, `osBootTested: false` сохраняются всегда.
Список `notVerified` явно перечисляет checkpoint, offline modules, candidate,
audit, timer, привязку old/new hashes и полный savedPm2997. Перенос true-полей из
наблюдения в release без свежей проверки под lock запрещён. Проверка гостевых
запросов не заменяет authenticated business-flow tests.

## Следующие проверяемые шаги

1. Выполнено: переданы только production-observe.cjs и production-evidence.cjs
   в `/home/smartplate-admin/evidence-20260920-TWYXSL/`, SHA-256 сверены,
   --observe без sudo завершился успешно.
2. Выполнено: пользователь прочитал PM2 inventory и классифицировал различия
   primary/fallback. Следующая production policy должна сохранять все определения
   процессов; для единственного smartplate-api сверять полные поля запуска,
   окружения и прав доступа под защищённым lock, а метрики рассматривать отдельно.
3. Реализовано локально: offline prepare/receipt и post-start контроллер,
   OS-адаптер для fixture, runtime units и отдельная suite. Windows-набор:
   129 passed / 14 Linux-only skipped / 0 failed. Linux-прогон выполнен 10/10:
   оба пути рестарта и все 12 выделенных границ SIGKILL подтверждены.
4. В Linux suite проверены unit ordering, отказ prepare, отсутствие/порча active
   pointer, сбой HTTP health и повтор после таймаута. Локальные тесты отдельно
   проверяют смену процесса, boot ID, generation и tree/dump во время evidence.
   Реальный отказ production БД/сети и полный production savedPm2997 ещё открыты.
   Fixture prepare требует остановленных rollback-ресурсов; runtime restart при
   активном rollback controller ещё требует внешней оркестрации без удержания flock.
5. После fixture: свежий checkpoint, точный план установки и отката конфигурации,
   отдельное согласование установки и реальной перезагрузки. До этого не менять
   pm2-root.service и не включать productionExecutionEnabled.

Модельная рекомендация обновлена по согласованию с пользователем 2026-10-04:
реализация и изолированные проверки — Sol 6.1 High. Astra нужна точечно при
неразрешённой неоднозначности либо для финального обзора критичных сценариев
перед production-установкой. Документация/Git — Sol; фиксация проверенных
результатов — Terra. Пользователю сообщать момент перехода.
