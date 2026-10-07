-- Фото для «Крем-суп из запечённых тыквы и батата».
-- cover — обложка; start/final — автоблоки, не фото нумерованных шагов.
-- Фото шагов: 1, 3–10. Для шагов 2 и 11 удаляются только заглушки photo:true.
-- is_published и остальные данные рецепта сохраняются и проверяются в транзакции.
-- Применить: sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-soup-roasted-pumpkin-sweet-potato-photos-2026-10-07.sql

BEGIN;

CREATE TEMP TABLE soup_pumpkin_photo_before ON COMMIT DROP AS
SELECT to_jsonb(r) AS original
FROM recipes AS r
WHERE r.id = 'soup-roasted-pumpkin-sweet-potato'
FOR UPDATE;

DO $guard$
DECLARE
  original JSONB;
BEGIN
  SELECT b.original INTO original FROM soup_pumpkin_photo_before AS b;
  IF NOT FOUND OR original->>'name' IS DISTINCT FROM 'Крем-суп из запечённых тыквы и батата'
    OR original->>'cat' IS DISTINCT FROM 'soups' THEN
    RAISE EXCEPTION 'Expected soup recipe was not found';
  END IF;
  IF jsonb_array_length(original->'steps') <> 11 THEN
    RAISE EXCEPTION 'Expected exactly 11 recipe steps';
  END IF;
  IF original->>'photo' IS NOT NULL
    AND original->>'photo' <> 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-cover.webp' THEN
    RAISE EXCEPTION 'Recipe already has an unexpected cover';
  END IF;
END $guard$;

SELECT original->>'id' AS id, original->>'is_published' AS is_published_before
FROM soup_pumpkin_photo_before;

UPDATE recipes AS r
SET photo = 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-cover.webp',
    steps = (
      WITH step_photos(step_no, photo_value) AS (
        VALUES
          (1, 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-1.webp'),
          (3, 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-3.webp'),
          (4, 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-4.webp'),
          (5, 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-5.webp'),
          (6, 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-6.webp'),
          (7, 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-7.webp'),
          (8, 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-8.webp'),
          (9, 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-9.webp'),
          (10, 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-10.webp')
      )
      SELECT jsonb_agg(
        CASE
          WHEN mapped.photo_value IS NOT NULL AND jsonb_typeof(source.step) = 'object'
            THEN (source.step - 'photo') || jsonb_build_object('photo', mapped.photo_value)
          WHEN mapped.photo_value IS NOT NULL AND jsonb_typeof(source.step) = 'string'
            THEN jsonb_build_object('text', source.step #>> '{}', 'photo', mapped.photo_value)
          WHEN mapped.photo_value IS NULL AND jsonb_typeof(source.step) = 'object'
            AND source.step->'photo' = 'true'::jsonb THEN source.step - 'photo'
          ELSE source.step
        END ORDER BY source.step_no
      )
      FROM jsonb_array_elements(r.steps) WITH ORDINALITY AS source(step, step_no)
      LEFT JOIN step_photos AS mapped ON mapped.step_no = source.step_no
    ),
    updated_at = now()
WHERE r.id = 'soup-roasted-pumpkin-sweet-potato';

DO $verify$
DECLARE
  original JSONB;
  current_recipe JSONB;
  original_steps JSONB;
  current_steps JSONB;
  step_no INTEGER;
  expected_photo TEXT;
BEGIN
  SELECT b.original INTO original FROM soup_pumpkin_photo_before AS b;
  SELECT to_jsonb(r) INTO current_recipe FROM recipes AS r
  WHERE r.id = 'soup-roasted-pumpkin-sweet-potato';
  IF (current_recipe - 'photo' - 'steps' - 'updated_at')
    IS DISTINCT FROM (original - 'photo' - 'steps' - 'updated_at') THEN
    RAISE EXCEPTION 'Non-media recipe fields or publication state changed';
  END IF;
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string'
    THEN jsonb_build_object('text', step #>> '{}') ELSE step - 'photo' END ORDER BY ordinal)
  INTO original_steps FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal);
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string'
    THEN jsonb_build_object('text', step #>> '{}') ELSE step - 'photo' END ORDER BY ordinal)
  INTO current_steps FROM jsonb_array_elements(current_recipe->'steps') WITH ORDINALITY AS s(step, ordinal);
  IF current_steps IS DISTINCT FROM original_steps THEN
    RAISE EXCEPTION 'Recipe step text or metadata changed';
  END IF;
  IF current_recipe->>'photo' IS DISTINCT FROM
    'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-cover.webp' THEN
    RAISE EXCEPTION 'Cover verification failed';
  END IF;
  FOREACH step_no IN ARRAY ARRAY[1,3,4,5,6,7,8,9,10] LOOP
    expected_photo := 'images/recipes/soup-roasted-pumpkin-sweet-potato/soup-roasted-pumpkin-sweet-potato-' || step_no || '.webp';
    IF current_recipe->'steps'->(step_no - 1)->>'photo' IS DISTINCT FROM expected_photo THEN
      RAISE EXCEPTION 'Photo verification failed at step %', step_no;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(current_recipe->'steps') AS s(step)
    WHERE step->'photo' = 'true'::jsonb) THEN
    RAISE EXCEPTION 'Empty photo placeholders remain';
  END IF;
END $verify$;

SELECT id, is_published AS is_published_after, photo,
       jsonb_array_length(steps) AS step_count,
       (SELECT count(*) FROM jsonb_array_elements(steps) AS s(step)
         WHERE jsonb_typeof(step->'photo') = 'string') AS step_photo_count,
       steps->1->'photo' AS step_2_photo, steps->10->'photo' AS step_11_photo
FROM recipes WHERE id = 'soup-roasted-pumpkin-sweet-potato';

COMMIT;
