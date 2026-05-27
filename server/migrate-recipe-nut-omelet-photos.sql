-- Рецепт: Омлет из нута (id: nut-omelet) — ПОДКЛЮЧЕНИЕ ФОТО
-- Applies ONLY root `photo` and `steps[].photo` (+ updated_at).
-- НЕ трогает тексты шагов и прочие поля рецепта (данные/КБЖУ/add_carbs и т.д.) —
-- они в server/migrate-nut-omelet.sql, не дублируем.
--
-- Convention (см. migrate-recipe-photos-batch-2026-05-25-new-recipes.sql):
--   root photo   -> nut-omelet-cover.webp
--   nut-omelet-N.webp -> steps[N-1].photo (точечно, через jsonb_set, текст сохраняется)
--   nut-omelet-start.webp / -final.webp рендерит фронт автоматически — в steps НЕ кладём.
--   Шаги с фото: 1,2,4,5,6,7,8. Шаг 3 — без фото (нет -3.png), не трогаем.
--
-- Apply:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-nut-omelet-photos.sql

BEGIN;

-- ── Preflight: запись должна существовать, иначе abort до изменений данных ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM recipes WHERE id = 'nut-omelet') THEN
    RAISE EXCEPTION 'Рецепт nut-omelet не найден — UPDATE отменён. Сначала применить migrate-nut-omelet.sql.';
  END IF;
END;
$$;

-- ── Helper: set only steps[p_step-1].photo, leaving step text intact ──
CREATE OR REPLACE FUNCTION pg_temp.set_step_photo(p_steps jsonb, p_step int, p_photo jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT CASE
    WHEN p_steps IS NULL
      OR jsonb_typeof(p_steps) <> 'array'
      OR p_step < 1
      OR p_step > jsonb_array_length(p_steps)
    THEN p_steps
    ELSE jsonb_set(
      p_steps,
      ARRAY[(p_step - 1)::text],
      CASE
        WHEN jsonb_typeof(p_steps -> (p_step - 1)) = 'object' THEN
          jsonb_set(p_steps -> (p_step - 1), '{photo}', p_photo, true)
        WHEN jsonb_typeof(p_steps -> (p_step - 1)) = 'string' THEN
          jsonb_build_object('text', p_steps ->> (p_step - 1), 'photo', p_photo)
        ELSE
          p_steps -> (p_step - 1)
      END,
      false
    )
  END;
$$;

-- ── nut-omelet — steps 1,2,4,5,6,7,8 (step 3 = no photo, не трогаем) ──
UPDATE recipes
SET
  photo = 'images/recipes/nut-omelet/nut-omelet-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          pg_temp.set_step_photo(
            pg_temp.set_step_photo(
              pg_temp.set_step_photo(
                steps,
                1, '"images/recipes/nut-omelet/nut-omelet-1.webp"'::jsonb
              ),
              2, '"images/recipes/nut-omelet/nut-omelet-2.webp"'::jsonb
            ),
            4, '"images/recipes/nut-omelet/nut-omelet-4.webp"'::jsonb
          ),
          5, '"images/recipes/nut-omelet/nut-omelet-5.webp"'::jsonb
        ),
        6, '"images/recipes/nut-omelet/nut-omelet-6.webp"'::jsonb
      ),
      7, '"images/recipes/nut-omelet/nut-omelet-7.webp"'::jsonb
    ),
    8, '"images/recipes/nut-omelet/nut-omelet-8.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'nut-omelet';

-- ── In-transaction guard (BEFORE COMMIT): cover + ровно 7 шагов с фото.
--    Любое несоответствие RAISE -> rollback, данные не сохранятся. ──
DO $$
DECLARE
  cover text;
  got   int;
BEGIN
  SELECT photo INTO cover FROM recipes WHERE id = 'nut-omelet';
  IF cover IS DISTINCT FROM 'images/recipes/nut-omelet/nut-omelet-cover.webp' THEN
    RAISE EXCEPTION 'nut-omelet unexpected cover photo: %. Rolling back.', cover;
  END IF;

  SELECT count(*) INTO got
  FROM recipes r, jsonb_array_elements(r.steps) AS s(step)
  WHERE r.id = 'nut-omelet'
    AND jsonb_typeof(s.step) = 'object'
    AND s.step ? 'photo'
    AND s.step->'photo' IS NOT NULL
    AND s.step->>'photo' <> ''
    AND s.step->>'photo' <> 'null';
  IF got <> 7 THEN
    RAISE EXCEPTION 'nut-omelet expected 7 steps with photo, got %. Rolling back.', got;
  END IF;
END;
$$;

COMMIT;

-- ── Read-only verification report ──
SELECT
  id,
  photo,
  jsonb_array_length(steps) AS steps_count,
  (
    SELECT count(*)
    FROM jsonb_array_elements(steps) AS s(step)
    WHERE jsonb_typeof(s.step) = 'object'
      AND s.step ? 'photo'
      AND s.step->'photo' IS NOT NULL
      AND s.step->>'photo' <> ''
      AND s.step->>'photo' <> 'null'
  ) AS steps_with_photo
FROM recipes
WHERE id = 'nut-omelet';
