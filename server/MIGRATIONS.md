# Миграции — заметки по статусу

Источник истины для активного применения миграций — отдельные dedicated-файлы (`migrate-recipe-<slug>.sql` и т.п.). Этот файл — короткие заметки о статусе bundled-миграций, чтобы не повторно регрессировать прод.

## Legacy / partially deprecated

- **`migrate-recipes-update.sql`** — legacy. Pilaf брать только из `migrate-recipe-lentil-mushroom-pilaf.sql`; стейл-INSERT для `lentil-mushroom-pilaf` в bundled-файле удалён. В файле остались только идемпотентные операции (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `INSERT … ON CONFLICT` для `beetroot-bean-arugula`, `UPDATE categories` с guard) — повторный запуск безопасен.
