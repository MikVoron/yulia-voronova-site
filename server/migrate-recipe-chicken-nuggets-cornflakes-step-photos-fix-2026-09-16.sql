-- Исправление маппинга фото шагов для «Куриные наггетсы в кукурузной панировке».
-- В исходном черновике шаги без фото хранятся JSON-строками. Для добавления photo
-- преобразуем только подтверждённые шаги в объекты {text, photo}.

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'cutlets-chicken-nuggets-cornflakes'
      AND photo = 'images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-cover.webp'
      AND jsonb_array_length(steps) = 8
      AND jsonb_typeof(steps->0) = 'string'
      AND jsonb_typeof(steps->1) = 'string'
      AND jsonb_typeof(steps->3) = 'string'
      AND jsonb_typeof(steps->4) = 'string'
      AND jsonb_typeof(steps->5) = 'string'
      AND jsonb_typeof(steps->6) = 'string'
  ) THEN
    RAISE EXCEPTION 'Recipe cutlets-chicken-nuggets-cornflakes is not in the expected pre-fix state';
  END IF;
END $guard$;

UPDATE recipes
SET
  steps = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              steps,
              '{0}',
              jsonb_build_object(
                'text', steps->0,
                'photo', to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-1.webp'::text)
              )
            ),
            '{1}',
            jsonb_build_object(
              'text', steps->1,
              'photo', to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-2.webp'::text)
            )
          ),
          '{3}',
          jsonb_build_object(
            'text', steps->3,
            'photo', '["images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-4.1.webp", "images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-4.2.webp"]'::jsonb
          )
        ),
        '{4}',
        jsonb_build_object(
          'text', steps->4,
          'photo', to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-5.webp'::text)
        )
      ),
      '{5}',
      jsonb_build_object(
        'text', steps->5,
        'photo', to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-6.webp'::text)
      )
    ),
    '{6}',
    jsonb_build_object(
      'text', steps->6,
      'photo', to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-7.webp'::text)
    )
  ),
  updated_at = now()
WHERE id = 'cutlets-chicken-nuggets-cornflakes';

COMMIT;

SELECT id, photo,
       steps->0->'photo' AS step_1_photo,
       steps->1->'photo' AS step_2_photo,
       steps->3->'photo' AS step_4_photo,
       steps->4->'photo' AS step_5_photo,
       steps->5->'photo' AS step_6_photo,
       steps->6->'photo' AS step_7_photo
FROM recipes
WHERE id = 'cutlets-chicken-nuggets-cornflakes';
