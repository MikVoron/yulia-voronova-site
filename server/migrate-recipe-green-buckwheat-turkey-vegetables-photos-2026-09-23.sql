-- Фото и публикация рецепта «Зелёная гречка с индейкой и овощами».
-- Сопоставление по контракту: cover/start/final — системные медиа,
-- нумерованные файлы — только фото соответствующих шагов.

BEGIN;

DO $guard$
DECLARE
  step_count INTEGER;
BEGIN
  SELECT jsonb_array_length(steps)
  INTO step_count
  FROM recipes
  WHERE id = 'green-buckwheat-turkey-vegetables'
    AND name = 'Зелёная гречка с индейкой и овощами';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected recipe green-buckwheat-turkey-vegetables was not found';
  END IF;

  IF step_count <> 11 THEN
    RAISE EXCEPTION 'Expected 11 recipe steps, found %', step_count;
  END IF;
END $guard$;

UPDATE recipes AS r
SET
  photo = 'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-cover.webp',
  steps = (
    WITH step_photos(step_no, photo_path) AS (
      VALUES
        (1, 'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-1.webp'),
        (3, 'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-3.webp'),
        (4, 'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-4.webp'),
        (5, 'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-5.webp'),
        (6, 'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-6.webp'),
        (8, 'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-8.webp'),
        (9, 'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-9.webp')
    )
    SELECT jsonb_agg(
      CASE
        WHEN mapped.photo_path IS NULL THEN source.step
        WHEN jsonb_typeof(source.step) = 'object'
          THEN (source.step - 'photo') || jsonb_build_object('photo', mapped.photo_path)
        WHEN jsonb_typeof(source.step) = 'string'
          THEN jsonb_build_object('text', source.step #>> '{}', 'photo', mapped.photo_path)
        ELSE source.step
      END
      ORDER BY source.step_no
    )
    FROM jsonb_array_elements(r.steps) WITH ORDINALITY AS source(step, step_no)
    LEFT JOIN step_photos AS mapped ON mapped.step_no = source.step_no
  ),
  is_published = true,
  updated_at = now()
WHERE r.id = 'green-buckwheat-turkey-vegetables'
  AND r.name = 'Зелёная гречка с индейкой и овощами';

COMMIT;

SELECT
  r.id,
  r.is_published,
  r.photo,
  array_agg(source.step_no ORDER BY source.step_no)
    FILTER (WHERE source.step ? 'photo') AS step_photo_numbers,
  count(*) FILTER (WHERE source.step ? 'photo') AS step_photo_count
FROM recipes AS r
CROSS JOIN LATERAL jsonb_array_elements(r.steps) WITH ORDINALITY AS source(step, step_no)
WHERE r.id = 'green-buckwheat-turkey-vegetables'
GROUP BY r.id, r.is_published, r.photo;
