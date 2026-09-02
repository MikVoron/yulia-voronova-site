-- Откат неудачного пакета фото для «Салата из печеных баклажанов с томатами и тахини».
-- Очищает обложку и фото шагов, не меняя текст, КБЖУ, категории или публикацию рецепта.
-- Фото будут добавлены заново из подтверждённого пользователем PNG-пакета.

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'salad-baked-eggplant-tomatoes-tahini'
      AND photo = 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-cover.webp'
      AND jsonb_array_length(steps) = 8
      AND steps -> 3 -> 'photo' = jsonb_build_array(
        'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-4-1.webp',
        'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-4-2.webp',
        'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-4-3.webp'
      )
  ) THEN
    RAISE EXCEPTION 'Expected current photo mapping is absent; refusing to clear another photo set';
  END IF;
END $guard$;

UPDATE recipes
SET
  photo = NULL,
  steps = jsonb_build_array(
    (steps -> 0) - 'photo',
    (steps -> 1) - 'photo',
    (steps -> 2) - 'photo',
    (steps -> 3) - 'photo',
    steps -> 4,
    (steps -> 5) - 'photo',
    (steps -> 6) - 'photo',
    (steps -> 7) - 'photo'
  ),
  updated_at = now()
WHERE id = 'salad-baked-eggplant-tomatoes-tahini';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'salad-baked-eggplant-tomatoes-tahini'
      AND photo IS NULL
      AND NOT (steps -> 0 ? 'photo')
      AND NOT (steps -> 1 ? 'photo')
      AND NOT (steps -> 2 ? 'photo')
      AND NOT (steps -> 3 ? 'photo')
      AND NOT (steps -> 5 ? 'photo')
      AND NOT (steps -> 6 ? 'photo')
      AND NOT (steps -> 7 ? 'photo')
  ) THEN
    RAISE EXCEPTION 'Recipe photo mapping was not fully removed';
  END IF;
END $guard$;

COMMIT;

SELECT id, photo, steps
FROM recipes
WHERE id = 'salad-baked-eggplant-tomatoes-tahini';
