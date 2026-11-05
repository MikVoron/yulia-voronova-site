-- Фотографии и публикация «Чечевичные кексы с морковью и петрушкой».
-- Пользователь явно разрешил публикацию 2026-11-05.
-- 9 WebP: cover/start/final и шаги 1, 2, 4, 5, 6, 7; шаги 3 и 8 без фото.
-- start/final не вставляются в steps: это автоматические блоки фронтенда.
-- Меняются только photo, steps[].photo, is_published и updated_at.
-- Доступ, КБЖУ, число порций, состав и тексты остаются прежними.
-- _filled_from_input: 9 фотографий по именам файлов; публикация=true.
-- _needs_clarification: []
-- _not_provided: фотографии шагов 3 и 8.
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-muffins-red-lentil-carrot-parsley-photos-2026-11-05.sql

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE lentil_muffins_photo_before ON COMMIT DROP AS
SELECT to_jsonb(r) AS original FROM recipes AS r
WHERE r.id = 'muffins-red-lentil-carrot-parsley' FOR UPDATE;

CREATE TEMP TABLE lentil_muffins_step_photos (
  step_no INTEGER PRIMARY KEY,
  photo JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO lentil_muffins_step_photos (step_no, photo) VALUES
  (1, '"images/recipes/muffins-red-lentil-carrot-parsley/muffins-red-lentil-carrot-parsley-1.webp"'::jsonb),
  (2, '"images/recipes/muffins-red-lentil-carrot-parsley/muffins-red-lentil-carrot-parsley-2.webp"'::jsonb),
  (4, '"images/recipes/muffins-red-lentil-carrot-parsley/muffins-red-lentil-carrot-parsley-4.webp"'::jsonb),
  (5, '"images/recipes/muffins-red-lentil-carrot-parsley/muffins-red-lentil-carrot-parsley-5.webp"'::jsonb),
  (6, '"images/recipes/muffins-red-lentil-carrot-parsley/muffins-red-lentil-carrot-parsley-6.webp"'::jsonb),
  (7, '"images/recipes/muffins-red-lentil-carrot-parsley/muffins-red-lentil-carrot-parsley-7.webp"'::jsonb);

DO $guard$
DECLARE
  original JSONB;
BEGIN
  SELECT b.original INTO original FROM lentil_muffins_photo_before AS b;
  IF NOT FOUND OR original->>'name' IS DISTINCT FROM 'Чечевичные кексы с морковью и петрушкой'
    OR original->>'cat' IS DISTINCT FROM 'breads' THEN
    RAISE EXCEPTION 'Expected lentil carrot muffins was not found';
  END IF;
  IF jsonb_array_length(original->'steps') IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'Expected exactly 8 lentil muffin steps';
  END IF;
  IF (SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string' THEN step #>> '{}' ELSE step->>'text' END ORDER BY ordinal)
      FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal))
    IS DISTINCT FROM $step_texts$["Замочите чечевицу минимум на 3 часа, можно на ночь, хорошо промойте и полностью слейте воду.","Переложите чечевицу в блендер, добавьте яйцо и 80 г воды. Пробейте до максимально гладкой массы. Тесто должно быть густым, но легко набираться ложкой и медленно с неё сползать. Если масса слишком плотная, добавьте ещё 10–15 г воды.","Морковь мелко натрите, петрушку мелко нарежьте.","Добавьте к чечевичной массе морковь, петрушку, луковый и чесночный порошок, сладкую и копчёную паприку, куркуму, соль и разрыхлитель.","Тщательно перемешайте ингредиенты.","Разложите тесто по формочкам, заполняя их примерно на ¾ объёма.","Выпекайте при 180 °C 25–30 минут, до лёгкого подрумянивания.","После выпечки оставьте кексы в форме на 2–3 минуты, затем аккуратно достаньте и полностью остудите на решётке."]$step_texts$::jsonb THEN
    RAISE EXCEPTION 'Step text or order changed; review photo numbering before applying';
  END IF;
  IF original->>'is_published' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Recipe is already published; inspect current state before applying';
  END IF;
  IF original->>'photo' IS NOT NULL AND original->>'photo' <>
    'images/recipes/muffins-red-lentil-carrot-parsley/muffins-red-lentil-carrot-parsley-cover.webp' THEN
    RAISE EXCEPTION 'Lentil muffins already has an unexpected cover';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal)
    LEFT JOIN lentil_muffins_step_photos AS p ON p.step_no = s.ordinal
    WHERE s.step->'photo' IS NOT NULL
      AND s.step->'photo' NOT IN ('null'::jsonb, 'true'::jsonb, '""'::jsonb)
      AND s.step->'photo' IS DISTINCT FROM p.photo
  ) THEN
    RAISE EXCEPTION 'A lentil muffins step already has an unexpected photo';
  END IF;
END $guard$;

SELECT original->>'id' AS id, original->>'is_published' AS is_published_before
FROM lentil_muffins_photo_before;

UPDATE recipes AS r
SET photo = 'images/recipes/muffins-red-lentil-carrot-parsley/muffins-red-lentil-carrot-parsley-cover.webp',
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
      LEFT JOIN lentil_muffins_step_photos AS mapped ON mapped.step_no = source.ordinal
    ),
    is_published = true,
    updated_at = now()
WHERE r.id = 'muffins-red-lentil-carrot-parsley';

DO $verify$
DECLARE
  original JSONB;
  current_recipe JSONB;
  original_steps JSONB;
  current_steps JSONB;
BEGIN
  SELECT b.original INTO original FROM lentil_muffins_photo_before AS b;
  SELECT to_jsonb(r) INTO current_recipe FROM recipes AS r
  WHERE r.id = 'muffins-red-lentil-carrot-parsley';
  IF (current_recipe - 'photo' - 'steps' - 'is_published' - 'updated_at')
    IS DISTINCT FROM (original - 'photo' - 'steps' - 'is_published' - 'updated_at') THEN
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
    'images/recipes/muffins-red-lentil-carrot-parsley/muffins-red-lentil-carrot-parsley-cover.webp' THEN
    RAISE EXCEPTION 'Lentil muffins cover verification failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM lentil_muffins_step_photos AS p
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
FROM recipes AS r CROSS JOIN lentil_muffins_photo_before AS b
WHERE r.id = 'muffins-red-lentil-carrot-parsley';

COMMIT;
