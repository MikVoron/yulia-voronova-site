-- Фотографии для текущей 9-шаговой версии «Пирог со сливами на цельнозерновой муке».
-- Нумерация строго по именам файлов; шаг 4 — галерея 4.1 и 4.2.
-- cover — обложка, start/final — автоблоки. Шаг 2 остаётся без фото.
-- Проверяется точный порядок и текст всех 9 шагов перед привязкой.
-- Доступ, публикация, текст и все немедийные поля сохраняются и проверяются.
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-pie-plums-wholegrain-photos-current-2026-10-22.sql

BEGIN;

CREATE TEMP TABLE plum_pie_photo_before ON COMMIT DROP AS
SELECT to_jsonb(r) AS original FROM recipes AS r
WHERE r.id = 'pie-plums-wholegrain' FOR UPDATE;

CREATE TEMP TABLE plum_pie_step_photos (
  step_no INTEGER PRIMARY KEY,
  photo JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO plum_pie_step_photos (step_no, photo) VALUES
  (1, '"images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-1.webp"'::jsonb),
  (3, '"images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-3.webp"'::jsonb),
  (4, '["images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-4.1.webp", "images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-4.2.webp"]'::jsonb),
  (5, '"images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-5.webp"'::jsonb),
  (6, '"images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-6.webp"'::jsonb),
  (7, '"images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-7.webp"'::jsonb),
  (8, '"images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-8.webp"'::jsonb),
  (9, '"images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-9.webp"'::jsonb);

DO $guard$
DECLARE
  original JSONB;
BEGIN
  SELECT b.original INTO original FROM plum_pie_photo_before AS b;
  IF NOT FOUND OR original->>'name' IS DISTINCT FROM 'Пирог со сливами на цельнозерновой муке'
    OR original->>'cat' IS DISTINCT FROM 'sweets' THEN
    RAISE EXCEPTION 'Expected plum_pie recipe was not found';
  END IF;
  IF jsonb_array_length(original->'steps') IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'Expected exactly 9 current plum pie steps';
  END IF;
  IF (SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string' THEN step #>> '{}' ELSE step->>'text' END ORDER BY ordinal)
      FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal))
    IS DISTINCT FROM $step_texts$["Смешайте муку, соль и сахар. Влейте оливковое масло и перемешайте.","Постепенно влейте горячую воду и замесите тесто.","Соберите тесто в шар, накройте и оставьте отдыхать на 15 минут.","Сливы разрежьте пополам, удалите косточки и нарежьте дольками.","Смешайте сливы с сахаром, корицей и 1½ ст. л. цельнозерновой муки. Надолго не оставляйте: сливы начнут давать много сока.","Тесто раскатайте на пергаменте в круг диаметром примерно 30–32 см.","Выложите сливовую начинку в центр, оставляя по краям 3–4 см свободного теста.","Заверните края теста внутрь, слегка накладывая один участок на другой.","Перенесите пирог вместе с пергаментом на противень. Выпекайте 35–40 минут при 190 °C, пока края не станут темнее, а сливовый сок в центре не начнёт заметно густеть."]$step_texts$::jsonb THEN
    RAISE EXCEPTION 'Current step order or text changed; review photo numbering before applying';
  END IF;
  IF original->>'photo' IS NOT NULL AND original->>'photo' <>
    'images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-cover.webp' THEN
    RAISE EXCEPTION 'Plum pie already has an unexpected cover';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal)
    LEFT JOIN plum_pie_step_photos AS p ON p.step_no = s.ordinal
    WHERE s.step->'photo' IS NOT NULL
      AND s.step->'photo' NOT IN ('null'::jsonb, 'true'::jsonb, '""'::jsonb)
      AND s.step->'photo' IS DISTINCT FROM p.photo
  ) THEN
    RAISE EXCEPTION 'A plum_pie step already has an unexpected photo';
  END IF;
END $guard$;

SELECT original->>'id' AS id, original->>'is_published' AS is_published_before
FROM plum_pie_photo_before;

UPDATE recipes AS r
SET photo = 'images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-cover.webp',
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
      LEFT JOIN plum_pie_step_photos AS mapped ON mapped.step_no = source.ordinal
    ),
    updated_at = now()
WHERE r.id = 'pie-plums-wholegrain';

DO $verify$
DECLARE
  original JSONB;
  current_recipe JSONB;
  original_steps JSONB;
  current_steps JSONB;
BEGIN
  SELECT b.original INTO original FROM plum_pie_photo_before AS b;
  SELECT to_jsonb(r) INTO current_recipe FROM recipes AS r
  WHERE r.id = 'pie-plums-wholegrain';
  IF (current_recipe - 'photo' - 'steps' - 'updated_at')
    IS DISTINCT FROM (original - 'photo' - 'steps' - 'updated_at') THEN
    RAISE EXCEPTION 'Non-media plum_pie fields or publication state changed';
  END IF;
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string'
    THEN jsonb_build_object('text', step #>> '{}') ELSE step - 'photo' END ORDER BY ordinal)
  INTO original_steps FROM jsonb_array_elements(original->'steps') WITH ORDINALITY AS s(step, ordinal);
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(step) = 'string'
    THEN jsonb_build_object('text', step #>> '{}') ELSE step - 'photo' END ORDER BY ordinal)
  INTO current_steps FROM jsonb_array_elements(current_recipe->'steps') WITH ORDINALITY AS s(step, ordinal);
  IF current_steps IS DISTINCT FROM original_steps THEN
    RAISE EXCEPTION 'Plum pie step text or metadata changed';
  END IF;
  IF current_recipe->>'photo' IS DISTINCT FROM
    'images/recipes/pie-plums-wholegrain/pie-plums-wholegrain-cover.webp' THEN
    RAISE EXCEPTION 'Plum pie cover verification failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM plum_pie_step_photos AS p
    WHERE current_recipe->'steps'->(p.step_no - 1)->'photo' IS DISTINCT FROM p.photo
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(current_recipe->'steps') AS s(step)
    WHERE step->'photo' = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'Plum pie step photo verification failed or placeholders remain';
  END IF;
END $verify$;

SELECT r.id, b.original->>'is_published' AS is_published_before,
       r.is_published AS is_published_after, r.photo, jsonb_array_length(r.steps) AS step_count,
       (SELECT count(*) FROM jsonb_array_elements(r.steps) AS s(step)
        WHERE jsonb_typeof(step->'photo') IN ('string', 'array')) AS illustrated_step_count,
       r.steps->3->'photo' AS step_4_photos
FROM recipes AS r CROSS JOIN plum_pie_photo_before AS b
WHERE r.id = 'pie-plums-wholegrain';

COMMIT;
