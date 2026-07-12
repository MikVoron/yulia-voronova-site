-- ============================================================================
-- access_level — трёхуровневая модель доступа к рецептам
-- ============================================================================
-- Заменяет boolean is_free более выразительной моделью:
--   free  — доступен гостю без регистрации
--   trial — доступен пользователю в trial и Pro
--   pro   — доступен только активной Pro-подписке (+admin)
--
-- is_free сохраняется как legacy-mirror: при записи в БД сервер сам
-- синхронизирует is_free = (access_level === 'free').
--
-- ИДЕМПОТЕНТНОСТЬ: backfill из is_free выполняется ТОЛЬКО при первом запуске
-- (когда колонки ещё нет). Повторный запуск ничего не перезаписывает — это
-- гарантирует, что выставленные админом вручную access_level='pro' рецепты
-- НЕ откатятся обратно в 'trial'.
--
-- Запустить на VPS:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-access-level.sql
--
-- Связано: docs/guest-mode-mvp.md §5A
-- ============================================================================

BEGIN;

-- ── (1) ALTER + Backfill: всё внутри одного DO-блока ─────────────────────────
-- Принцип: проверяем существование колонки ДО ALTER. Если её не было — добавляем
-- и сразу заполняем из is_free. Если уже была — не трогаем содержимое.
DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'recipes'
      AND column_name = 'access_level'
  ) INTO col_exists;

  IF NOT col_exists THEN
    -- Первый запуск: создаём колонку с дефолтом 'pro' (самый закрытый — защита
    -- от случайной утечки доступа для будущих рецептов с пропущенным полем).
    ALTER TABLE recipes
      ADD COLUMN access_level TEXT NOT NULL DEFAULT 'pro';

    -- Сразу заполняем из is_free для существующих строк:
    --   is_free=true  → 'free'
    --   is_free=false → 'trial' (НЕ 'pro' — не закрываем всё разом)
    UPDATE recipes
    SET access_level = CASE WHEN is_free = true THEN 'free' ELSE 'trial' END;

    RAISE NOTICE 'access_level: column created and backfilled from is_free';
  ELSE
    RAISE NOTICE 'access_level: column already exists, backfill skipped';
  END IF;
END $$;

-- ── (2) Страховочные шаги: для случая, если колонка была создана вручную
--    раньше без DEFAULT / NOT NULL / без backfill (например, ручной ALTER на VPS).
--    Все три шага идемпотентны и безопасны при повторном запуске. ──────────────

-- 2.1. Гарантируем DEFAULT 'pro' — повторный SET не имеет эффекта, если уже стоит.
ALTER TABLE recipes ALTER COLUMN access_level SET DEFAULT 'pro';

-- 2.2. Defensive backfill: заполняем только NULL-строки. Если их нет — no-op.
--      Уже выставленные вручную 'pro' / 'trial' / 'free' НЕ трогаются.
UPDATE recipes
SET access_level = CASE WHEN is_free = true THEN 'free' ELSE 'trial' END
WHERE access_level IS NULL;

-- 2.3. Гарантируем NOT NULL. Безопасно после 2.2 — NULL-строк не осталось.
ALTER TABLE recipes ALTER COLUMN access_level SET NOT NULL;

-- ── (3) CHECK constraint — идемпотентно (drop+create) ────────────────────────
ALTER TABLE recipes
  DROP CONSTRAINT IF EXISTS recipes_access_level_check;
ALTER TABLE recipes
  ADD CONSTRAINT recipes_access_level_check
  CHECK (access_level IN ('free', 'trial', 'pro'));

-- ── (4) Индекс на access_level (для фильтрации по уровню при росте базы) ─────
CREATE INDEX IF NOT EXISTS idx_recipes_access_level ON recipes(access_level);

-- ── Контрольный отчёт после миграции ─────────────────────────────────────────
DO $$
DECLARE
  free_cnt INT;
  trial_cnt INT;
  pro_cnt INT;
BEGIN
  SELECT COUNT(*) INTO free_cnt  FROM recipes WHERE access_level = 'free';
  SELECT COUNT(*) INTO trial_cnt FROM recipes WHERE access_level = 'trial';
  SELECT COUNT(*) INTO pro_cnt   FROM recipes WHERE access_level = 'pro';
  RAISE NOTICE 'access_level distribution: free=%, trial=%, pro=%', free_cnt, trial_cnt, pro_cnt;
END $$;

COMMIT;
