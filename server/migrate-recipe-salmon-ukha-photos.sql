-- Привязать фотографии (cover + step photos) к рецепту salmon-ukha.
-- Сами файлы лежат в images/recipes/salmon-ukha/ (WebP, конвертированы из PNG).
--
-- Шаги:
--   1 — без фото (-start.webp авто-рендерится фронтом после ингредиентов).
--   2, 4, 7 — одно фото.
--   8 — мультифото (8-1, 8-2).
--   9 — без фото (-final.webp авто-рендерится в блоке «Приятного аппетита»).
--
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-recipe-salmon-ukha-photos.sql

BEGIN;

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

UPDATE recipes
SET
  photo = 'images/recipes/salmon-ukha/salmon-ukha-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          steps,
          2,
          '"images/recipes/salmon-ukha/salmon-ukha-2.webp"'::jsonb
        ),
        4,
        '"images/recipes/salmon-ukha/salmon-ukha-4.webp"'::jsonb
      ),
      7,
      '"images/recipes/salmon-ukha/salmon-ukha-7.webp"'::jsonb
    ),
    8,
    '["images/recipes/salmon-ukha/salmon-ukha-8-1.webp","images/recipes/salmon-ukha/salmon-ukha-8-2.webp"]'::jsonb
  ),
  updated_at = now()
WHERE id = 'salmon-ukha';

COMMIT;

-- Проверка
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
WHERE id = 'salmon-ukha';
