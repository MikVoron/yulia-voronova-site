-- Фото «Томатная овсянка» с учётом текущего опубликованного состояния.
-- Проверка 2026-11-12: рецепт уже опубликован, доступ free, фото отсутствуют.
-- Устанавливаются 8 WebP: cover/start/final и шаги 1–5; шаг 6 без фото.
-- Публикация, доступ, состав, тексты и остальные поля сохраняются из текущей БД.
-- Строковые шаги преобразуются в объекты {text, photo} только для назначения фото.
-- _filled_from_input: фото по точным именам файлов; публикация true -> true.
-- _needs_clarification: []
-- _not_provided: фото шестого шага.
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-side-tomato-oatmeal-photos-current-2026-11-12.sql

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE tomato_oatmeal_photo_before ON COMMIT DROP AS
SELECT to_jsonb(r) AS original FROM recipes AS r
WHERE r.id = 'side-tomato-oatmeal' FOR UPDATE;

CREATE TEMP TABLE tomato_oatmeal_step_photos (
  step_no INTEGER PRIMARY KEY,
  photo JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO tomato_oatmeal_step_photos (step_no, photo) VALUES
  (1, '"images/recipes/side-tomato-oatmeal/side-tomato-oatmeal-1.webp"'::jsonb),
  (2, '"images/recipes/side-tomato-oatmeal/side-tomato-oatmeal-2.webp"'::jsonb),
  (3, '"images/recipes/side-tomato-oatmeal/side-tomato-oatmeal-3.webp"'::jsonb),
  (4, '"images/recipes/side-tomato-oatmeal/side-tomato-oatmeal-4.webp"'::jsonb),
  (5, '"images/recipes/side-tomato-oatmeal/side-tomato-oatmeal-5.webp"'::jsonb);

DO $guard$
DECLARE
  original JSONB;
BEGIN
  SELECT b.original INTO original FROM tomato_oatmeal_photo_before AS b;
  IF NOT FOUND OR original->>'name' IS DISTINCT FROM 'Томатная овсянка'
    OR original->>'cat' IS DISTINCT FROM 'sides' THEN
    RAISE EXCEPTION 'Expected tomato oatmeal was not found';
  END IF;
  IF jsonb_array_length(original->'steps') IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'Expected exactly 6 tomato oatmeal steps';
  END IF;
  IF (SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string' THEN step #>> '{}' ELSE step->>'text' END ORDER BY ordinal)
      FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal))
    IS DISTINCT FROM $step_texts$["Мелко нарежьте лук и поджарьте его с 1 ч. л. растительного масла до мягкости около 3 минут.","К луку добавьте сладкую и копчёную паприку, орегано, перемешайте в течение нескольких секунд.","Влейте томаты, хорошо перемешайте и потушите около 5 минут.","Добавьте овсяные хлопья и 260 мл горячей воды и варите на слабом огне 7–10 минут, периодически помешивая. Если овсянка становится слишком густой до того, как хлопья готовы, добавьте ещё немного воды.","Снимите кастрюлю с огня, добавьте мисо-пасту и хорошо перемешайте до однородности. При необходимости посолите.","Мисо-пасту можно не добавлять. В этом случае просто отрегулируйте соль по вкусу."]$step_texts$::jsonb THEN
    RAISE EXCEPTION 'Step text or order changed; review photo numbering before applying';
  END IF;
  IF original->>'is_published' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Expected currently published recipe; inspect state before applying';
  END IF;
  IF original->>'photo' IS NOT NULL THEN
    RAISE EXCEPTION 'Tomato oatmeal already has a cover; inspect state before applying';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal)
    LEFT JOIN tomato_oatmeal_step_photos AS p ON p.step_no = s.ordinal
    WHERE s.step->'photo' IS NOT NULL
      AND s.step->'photo' NOT IN ('null'::jsonb, 'true'::jsonb, '""'::jsonb)
      AND s.step->'photo' IS DISTINCT FROM p.photo
  ) THEN
    RAISE EXCEPTION 'A tomato oatmeal step already has an unexpected photo';
  END IF;
END $guard$;

SELECT original->>'id' AS id, original->>'is_published' AS is_published_before
FROM tomato_oatmeal_photo_before;

UPDATE recipes AS r
SET photo = 'images/recipes/side-tomato-oatmeal/side-tomato-oatmeal-cover.webp',
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
      LEFT JOIN tomato_oatmeal_step_photos AS mapped ON mapped.step_no = source.ordinal
    ),
    updated_at = now()
WHERE r.id = 'side-tomato-oatmeal';

DO $verify$
DECLARE
  original JSONB;
  current_recipe JSONB;
  original_steps JSONB;
  current_steps JSONB;
BEGIN
  SELECT b.original INTO original FROM tomato_oatmeal_photo_before AS b;
  SELECT to_jsonb(r) INTO current_recipe FROM recipes AS r
  WHERE r.id = 'side-tomato-oatmeal';
  IF (current_recipe - 'photo' - 'steps' - 'updated_at')
    IS DISTINCT FROM (original - 'photo' - 'steps' - 'updated_at') THEN
    RAISE EXCEPTION 'Unapproved non-media recipe fields changed';
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
  IF current_recipe->>'is_published' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Recipe publication failed';
  END IF;
  IF current_recipe->>'photo' IS DISTINCT FROM
    'images/recipes/side-tomato-oatmeal/side-tomato-oatmeal-cover.webp' THEN
    RAISE EXCEPTION 'Tomato oatmeal cover verification failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM tomato_oatmeal_step_photos AS p
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
FROM recipes AS r CROSS JOIN tomato_oatmeal_photo_before AS b
WHERE r.id = 'side-tomato-oatmeal';

COMMIT;
