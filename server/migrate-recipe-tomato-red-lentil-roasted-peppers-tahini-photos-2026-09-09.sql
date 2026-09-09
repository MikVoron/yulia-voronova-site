-- Фото для «Томатного супа с красной чечевицей, печеными перцем и тахини».
-- Применять после копирования images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/ на VPS.
-- Фото: cover, start, final, 1-1/1-2 (галерея шага 1), 2–10.
-- Шаги 11–12 остаются без фото: исходных файлов для них нет.
--
-- Применить:
--   scp server/migrate-recipe-tomato-red-lentil-roasted-peppers-tahini-photos-2026-09-09.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql -v ON_ERROR_STOP=1 -d smartplate_db -f /tmp/migrate-recipe-tomato-red-lentil-roasted-peppers-tahini-photos-2026-09-09.sql"

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'soup-tomato-red-lentil-roasted-peppers-tahini'
      AND name = 'Томатный суп с красной чечевицей, печеными перцем и тахини'
      AND photo IS NULL
      AND jsonb_array_length(steps) = 12
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(steps) AS step
        WHERE step ? 'photo'
      )
  ) THEN
    RAISE EXCEPTION 'Expected photo-free 12-step recipe soup-tomato-red-lentil-roasted-peppers-tahini is absent';
  END IF;
END $guard$;

UPDATE recipes
SET
  photo = 'images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-cover.webp',
  steps = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      steps,
                      '{0,photo}',
                      '[
                        "images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-1-1.webp",
                        "images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-1-2.webp"
                      ]'::jsonb,
                      true
                    ),
                    '{1,photo}',
                    '"images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-2.webp"'::jsonb,
                    true
                  ),
                  '{2,photo}',
                  '"images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-3.webp"'::jsonb,
                  true
                ),
                '{3,photo}',
                '"images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-4.webp"'::jsonb,
                true
              ),
              '{4,photo}',
              '"images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-5.webp"'::jsonb,
              true
            ),
            '{5,photo}',
            '"images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-6.webp"'::jsonb,
            true
          ),
          '{6,photo}',
          '"images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-7.webp"'::jsonb,
          true
        ),
        '{7,photo}',
        '"images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-8.webp"'::jsonb,
        true
      ),
      '{8,photo}',
      '"images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-9.webp"'::jsonb,
      true
    ),
    '{9,photo}',
    '"images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-10.webp"'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = 'soup-tomato-red-lentil-roasted-peppers-tahini';

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'soup-tomato-red-lentil-roasted-peppers-tahini'
      AND photo = 'images/recipes/soup-tomato-red-lentil-roasted-peppers-tahini/soup-tomato-red-lentil-roasted-peppers-tahini-cover.webp'
      AND jsonb_typeof(steps -> 0 -> 'photo') = 'array'
      AND jsonb_array_length(steps -> 0 -> 'photo') = 2
      AND jsonb_typeof(steps -> 1 -> 'photo') = 'string'
      AND jsonb_typeof(steps -> 9 -> 'photo') = 'string'
      AND NOT (steps -> 10 ? 'photo')
      AND NOT (steps -> 11 ? 'photo')
  ) THEN
    RAISE EXCEPTION 'Photo mapping verification failed for soup-tomato-red-lentil-roasted-peppers-tahini';
  END IF;
END $verify$;

COMMIT;

SELECT r.photo,
       count(*) FILTER (WHERE step ? 'photo') AS steps_with_photo,
       jsonb_array_length(r.steps -> 0 -> 'photo') AS step_1_photo_count,
       (r.steps -> 10 ? 'photo') AS step_11_has_photo,
       (r.steps -> 11 ? 'photo') AS step_12_has_photo
FROM recipes r
CROSS JOIN LATERAL jsonb_array_elements(r.steps) AS step
WHERE r.id = 'soup-tomato-red-lentil-roasted-peppers-tahini'
GROUP BY r.photo, r.steps;
