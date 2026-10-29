-- Фотографии «Паштет из тыквы и белой фасоли».
-- Нумерация строго по файлам: фотографии шагов 1 и 4.
-- cover — обложка; start/final — автоблоки; исходный finish.png -> final.webp.
-- У шагов 2, 3, 5 и 6 нет предоставленных фото: убрать только заглушки true.
-- Ожидаются 6 шагов из подтверждённого импорта. При изменённом тексте — отказ.
-- Статус публикации, доступ, ингредиенты, КБЖУ и прочие поля сохраняются.
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-spread-pumpkin-white-beans-photos-2026-10-29.sql

BEGIN;

CREATE TEMP TABLE pumpkin_spread_photo_before ON COMMIT DROP AS
SELECT to_jsonb(r) AS original FROM recipes AS r
WHERE r.id = 'spread-pumpkin-white-beans' FOR UPDATE;

CREATE TEMP TABLE pumpkin_spread_step_photos (
  step_no INTEGER PRIMARY KEY,
  photo JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO pumpkin_spread_step_photos (step_no, photo) VALUES
  (1, '"images/recipes/spread-pumpkin-white-beans/spread-pumpkin-white-beans-1.webp"'::jsonb),
  (4, '"images/recipes/spread-pumpkin-white-beans/spread-pumpkin-white-beans-4.webp"'::jsonb);

DO $guard$
DECLARE
  original JSONB;
BEGIN
  SELECT b.original INTO original FROM pumpkin_spread_photo_before AS b;
  IF NOT FOUND OR original->>'name' IS DISTINCT FROM 'Паштет из тыквы и белой фасоли'
    OR original->>'cat' IS DISTINCT FROM 'spreads' THEN
    RAISE EXCEPTION 'Expected pumpkin and white bean spread was not found';
  END IF;
  IF jsonb_array_length(original->'steps') IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'Expected exactly 6 pumpkin spread steps';
  END IF;
  IF (SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string' THEN step #>> '{}' ELSE step->>'text' END ORDER BY ordinal)
      FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal))
    IS DISTINCT FROM $step_texts$["Разрежьте тыкву вдоль пополам, удалите семена, положите срезом вниз на противень с пергаментом и запеките при 200 °C 35–45 минут до полной мягкости.","Немного остудите, выньте мякоть ложкой и отвесьте 250 г.","Если используете консервированную фасоль, слейте жидкость и хорошо промойте.","Положите в блендер фасоль, тыкву, тахини, лимонный сок, соевый соус и копчёную паприку.","Пробейте до максимально гладкой массы. Если намазка слишком густая, добавьте воду по 1 ст. л. до нужной консистенции.","При необходимости посолите и добавьте ещё лимонного сока."]$step_texts$::jsonb THEN
    RAISE EXCEPTION 'Step text or order changed; review photo numbering before applying';
  END IF;
  IF original->>'photo' IS NOT NULL AND original->>'photo' <>
    'images/recipes/spread-pumpkin-white-beans/spread-pumpkin-white-beans-cover.webp' THEN
    RAISE EXCEPTION 'Pumpkin spread already has an unexpected cover';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal)
    LEFT JOIN pumpkin_spread_step_photos AS p ON p.step_no = s.ordinal
    WHERE s.step->'photo' IS NOT NULL
      AND s.step->'photo' NOT IN ('null'::jsonb, 'true'::jsonb, '""'::jsonb)
      AND s.step->'photo' IS DISTINCT FROM p.photo
  ) THEN
    RAISE EXCEPTION 'A pumpkin spread step already has an unexpected photo';
  END IF;
END $guard$;

SELECT original->>'id' AS id, original->>'is_published' AS is_published_before
FROM pumpkin_spread_photo_before;

UPDATE recipes AS r
SET photo = 'images/recipes/spread-pumpkin-white-beans/spread-pumpkin-white-beans-cover.webp',
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
      LEFT JOIN pumpkin_spread_step_photos AS mapped ON mapped.step_no = source.ordinal
    ),
    updated_at = now()
WHERE r.id = 'spread-pumpkin-white-beans';

DO $verify$
DECLARE
  original JSONB;
  current_recipe JSONB;
  original_steps JSONB;
  current_steps JSONB;
BEGIN
  SELECT b.original INTO original FROM pumpkin_spread_photo_before AS b;
  SELECT to_jsonb(r) INTO current_recipe FROM recipes AS r
  WHERE r.id = 'spread-pumpkin-white-beans';
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
    'images/recipes/spread-pumpkin-white-beans/spread-pumpkin-white-beans-cover.webp' THEN
    RAISE EXCEPTION 'Pumpkin spread cover verification failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pumpkin_spread_step_photos AS p
    WHERE current_recipe->'steps'->(p.step_no - 1)->'photo' IS DISTINCT FROM p.photo
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(current_recipe->'steps') AS s(step)
    WHERE step->'photo' = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'Recipe step photo verification failed or placeholders remain';
  END IF;
END $verify$;

SELECT r.id, b.original->>'is_published' AS is_published_before,
       r.is_published AS is_published_after, r.photo,
       jsonb_array_length(r.steps) AS step_count,
       (SELECT count(*) FROM jsonb_array_elements(r.steps) AS s(step)
        WHERE jsonb_typeof(step->'photo') IN ('string', 'array')) AS illustrated_step_count,
       r.steps->0->'photo' AS step_1_photo, r.steps->3->'photo' AS step_4_photo
FROM recipes AS r CROSS JOIN pumpkin_spread_photo_before AS b
WHERE r.id = 'spread-pumpkin-white-beans';

COMMIT;
