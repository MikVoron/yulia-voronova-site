-- Фото рецепта № 103 «Шакшука с белой фасолью».
-- Обложка и пять фото для шагов 2–5. В step.photo шага 2 хранится массив.
-- Файлы start/final подключаются автоматически из пути обложки.
-- После установки WebP, checkpoint и dry-run:
-- sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-shakshuka-white-beans-photos-2026-11-18.sql

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $attach$
DECLARE
  original recipes%ROWTYPE;
  actual jsonb;
  updated_steps jsonb;
  step jsonb;
  step_index integer;
  step_photo jsonb;
  cover constant text := 'images/recipes/shakshuka-white-beans/shakshuka-white-beans-cover.webp';
  photos constant jsonb := '{
    "1": ["images/recipes/shakshuka-white-beans/shakshuka-white-beans-2.1.webp",
          "images/recipes/shakshuka-white-beans/shakshuka-white-beans-2.2.webp"],
    "2": "images/recipes/shakshuka-white-beans/shakshuka-white-beans-3.webp",
    "3": "images/recipes/shakshuka-white-beans/shakshuka-white-beans-4.webp",
    "4": "images/recipes/shakshuka-white-beans/shakshuka-white-beans-5.webp"
  }'::jsonb;
BEGIN
  SELECT * INTO original FROM recipes WHERE id = 'shakshuka-white-beans' FOR UPDATE;
  IF NOT FOUND OR original.name IS DISTINCT FROM 'Шакшука с белой фасолью' THEN
    RAISE EXCEPTION 'Expected shakshuka-white-beans was not found';
  END IF;

  IF (SELECT jsonb_agg(CASE WHEN jsonb_typeof(s.step) = 'string' THEN s.step #>> '{}' ELSE s.step->>'text' END
                       ORDER BY s.ordinal)
      FROM jsonb_array_elements(original.steps) WITH ORDINALITY AS s(step, ordinal))
      IS DISTINCT FROM $step_texts$[
        "Мелко нарежьте лук и обжарьте на оливковом масле на среднем огне около 5 минут, до мягкости.",
        "Добавьте чеснок, сладкую и копчёную паприку. Прогрейте 30 секунд, чтобы специи раскрыли аромат.",
        "Влейте томаты, разомните их лопаткой, посолите и тушите около 10 минут, чтобы соус немного загустел.",
        "Добавьте белую фасоль и готовьте ещё 5 минут.",
        "Сделайте в соусе 4 углубления и аккуратно разбейте туда яйца.",
        "Накройте крышкой и готовьте на слабом огне примерно 5–7 минут, пока белок не схватится, а желток останется жидким.",
        "Посыпьте петрушкой и подавайте сразу."
      ]$step_texts$::jsonb THEN
    RAISE EXCEPTION 'Step text or order changed; review photo numbering before applying';
  END IF;

  IF NULLIF(original.photo, '') IS NOT NULL AND original.photo IS DISTINCT FROM cover THEN
    RAISE EXCEPTION 'Recipe already has a different cover';
  END IF;

  updated_steps := original.steps;
  FOR step_index, step_photo IN SELECT key::integer, value FROM jsonb_each(photos) LOOP
    step := original.steps->step_index;
    IF COALESCE(step->'photo', 'null'::jsonb) NOT IN ('null'::jsonb, 'true'::jsonb, '""'::jsonb, step_photo) THEN
      RAISE EXCEPTION 'Step % already has a different photo', step_index + 1;
    END IF;
    IF jsonb_typeof(step) = 'string' THEN
      step := jsonb_build_object('text', step #>> '{}');
    END IF;
    updated_steps := jsonb_set(updated_steps, ARRAY[step_index::text], step || jsonb_build_object('photo', step_photo));
  END LOOP;

  UPDATE recipes SET photo = cover, steps = updated_steps, updated_at = now()
  WHERE id = original.id
    AND (photo IS DISTINCT FROM cover OR steps IS DISTINCT FROM updated_steps);

  SELECT to_jsonb(r) - 'updated_at' INTO actual FROM recipes r WHERE r.id = original.id;
  IF actual IS DISTINCT FROM ((to_jsonb(original) - 'updated_at') || jsonb_build_object('photo', cover, 'steps', updated_steps)) THEN
    RAISE EXCEPTION 'Recipe readback differs from the media-only update';
  END IF;
END $attach$;

COMMIT;

SELECT id, is_published, access_level, photo, steps->1->'photo' AS step_2,
       steps->2->'photo' AS step_3, steps->3->'photo' AS step_4, steps->4->'photo' AS step_5
FROM recipes WHERE id = 'shakshuka-white-beans';
