-- Фотографии для «Гранола с тыквенным пюре».
-- cover — обложка; start/final — автоблоки, не нумерованные шаги.
-- Шаги 3 и 9: упорядоченные массивы из двух фотографий.
-- Шаги 1, 5 и 6: удалить только пустые заглушки photo:true.
-- Текст, прочие поля и статус публикации сохраняются и проверяются в транзакции.
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-granola-pumpkin-puree-photos-2026-10-14.sql

BEGIN;

CREATE TEMP TABLE granola_photo_before ON COMMIT DROP AS
SELECT to_jsonb(r) AS original FROM recipes AS r
WHERE r.id = 'granola-pumpkin-puree' FOR UPDATE;

CREATE TEMP TABLE granola_step_photos (
  step_no INTEGER PRIMARY KEY,
  photo JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO granola_step_photos (step_no, photo) VALUES
  (2, '"images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-2.webp"'::jsonb),
  (3, '["images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-3.1.webp", "images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-3.2.webp"]'::jsonb),
  (4, '"images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-4.webp"'::jsonb),
  (7, '"images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-7.webp"'::jsonb),
  (8, '"images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-8.webp"'::jsonb),
  (9, '["images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-9.1.webp", "images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-9.2.webp"]'::jsonb),
  (10, '"images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-10.webp"'::jsonb),
  (11, '"images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-11.webp"'::jsonb);

DO $guard$
DECLARE
  original JSONB;
BEGIN
  SELECT b.original INTO original FROM granola_photo_before AS b;
  IF NOT FOUND OR original->>'name' IS DISTINCT FROM 'Гранола с тыквенным пюре'
    OR original->>'cat' IS DISTINCT FROM 'breakfasts' THEN
    RAISE EXCEPTION 'Expected granola recipe was not found';
  END IF;
  IF jsonb_array_length(original->'steps') IS DISTINCT FROM 11 THEN
    RAISE EXCEPTION 'Expected exactly 11 granola steps';
  END IF;
  IF original->>'photo' IS NOT NULL AND original->>'photo' <>
    'images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-cover.webp' THEN
    RAISE EXCEPTION 'Granola already has an unexpected cover';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal)
    LEFT JOIN granola_step_photos AS p ON p.step_no = s.ordinal
    WHERE s.step->'photo' IS NOT NULL
      AND s.step->'photo' NOT IN ('null'::jsonb, 'true'::jsonb, '""'::jsonb)
      AND s.step->'photo' IS DISTINCT FROM p.photo
  ) THEN
    RAISE EXCEPTION 'A granola step already has an unexpected photo';
  END IF;
END $guard$;

SELECT original->>'id' AS id, original->>'is_published' AS is_published_before
FROM granola_photo_before;

UPDATE recipes AS r
SET photo = 'images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-cover.webp',
    steps = (
      SELECT jsonb_agg(
        CASE
          WHEN mapped.photo IS NOT NULL AND jsonb_typeof(source.step) = 'object'
            THEN (source.step - 'photo') || jsonb_build_object('photo', mapped.photo)
          WHEN mapped.photo IS NOT NULL AND jsonb_typeof(source.step) = 'string'
            THEN jsonb_build_object('text', source.step #>> '{}', 'photo', mapped.photo)
          WHEN mapped.photo IS NULL AND jsonb_typeof(source.step) = 'object'
            AND source.step->'photo' = 'true'::jsonb THEN source.step - 'photo'
          ELSE source.step
        END ORDER BY source.ordinal
      )
      FROM jsonb_array_elements(r.steps) WITH ORDINALITY AS source(step, ordinal)
      LEFT JOIN granola_step_photos AS mapped ON mapped.step_no = source.ordinal
    ),
    updated_at = now()
WHERE r.id = 'granola-pumpkin-puree';

DO $verify$
DECLARE
  original JSONB;
  current_recipe JSONB;
  original_steps JSONB;
  current_steps JSONB;
BEGIN
  SELECT b.original INTO original FROM granola_photo_before AS b;
  SELECT to_jsonb(r) INTO current_recipe FROM recipes AS r
  WHERE r.id = 'granola-pumpkin-puree';
  IF (current_recipe - 'photo' - 'steps' - 'updated_at')
    IS DISTINCT FROM (original - 'photo' - 'steps' - 'updated_at') THEN
    RAISE EXCEPTION 'Non-media granola fields or publication state changed';
  END IF;
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string'
    THEN jsonb_build_object('text', step #>> '{}') ELSE step - 'photo' END ORDER BY ordinal)
  INTO original_steps FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal);
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string'
    THEN jsonb_build_object('text', step #>> '{}') ELSE step - 'photo' END ORDER BY ordinal)
  INTO current_steps FROM jsonb_array_elements(current_recipe->'steps') WITH ORDINALITY AS s(step, ordinal);
  IF current_steps IS DISTINCT FROM original_steps THEN
    RAISE EXCEPTION 'Granola step text or metadata changed';
  END IF;
  IF current_recipe->>'photo' IS DISTINCT FROM
    'images/recipes/granola-pumpkin-puree/granola-pumpkin-puree-cover.webp' THEN
    RAISE EXCEPTION 'Granola cover verification failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM granola_step_photos AS p
    WHERE current_recipe->'steps'->(p.step_no - 1)->'photo' IS DISTINCT FROM p.photo
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(current_recipe->'steps') AS s(step)
    WHERE step->'photo' = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'Granola step photo verification failed or placeholders remain';
  END IF;
END $verify$;

SELECT r.id, b.original->>'is_published' AS is_published_before,
       r.is_published AS is_published_after, r.photo, jsonb_array_length(r.steps) AS step_count,
       (SELECT count(*) FROM jsonb_array_elements(r.steps) AS s(step)
        WHERE jsonb_typeof(step->'photo') IN ('string', 'array')) AS illustrated_step_count,
       r.steps->2->'photo' AS step_3_photos, r.steps->8->'photo' AS step_9_photos
FROM recipes AS r CROSS JOIN granola_photo_before AS b
WHERE r.id = 'granola-pumpkin-puree';

COMMIT;
