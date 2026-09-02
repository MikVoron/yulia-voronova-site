-- Фото для «Салата из печеных баклажанов с томатами и тахини».
-- Исходные HEIC сохраняются в репозитории вне этого коммита; в карточке используются WebP.
-- Шаг 4 содержит подтверждённую галерею из трёх последовательных кадров.
-- Применить после копирования images/recipes/salad-baked-eggplant-tomatoes-tahini/ на VPS:
--   scp server/migrate-salad-baked-eggplant-tomatoes-tahini-photos-2026-09-02.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-salad-baked-eggplant-tomatoes-tahini-photos-2026-09-02.sql"

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'salad-baked-eggplant-tomatoes-tahini'
      AND name = 'Салат из печеных баклажанов с томатами и тахини'
      AND jsonb_array_length(steps) = 8
  ) THEN
    RAISE EXCEPTION 'Expected recipe salad-baked-eggplant-tomatoes-tahini with eight steps is absent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'salad-baked-eggplant-tomatoes-tahini'
      AND photo IS NOT NULL
      AND photo <> 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-cover.webp'
  ) THEN
    RAISE EXCEPTION 'Recipe cover already points to a different photo';
  END IF;
END $guard$;

UPDATE recipes
SET
  photo = 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-cover.webp',
  steps = jsonb_build_array(
    (steps -> 0) || jsonb_build_object('photo', 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-1.webp'),
    (steps -> 1) || jsonb_build_object('photo', 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-2.webp'),
    (steps -> 2) || jsonb_build_object('photo', 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-3.webp'),
    (steps -> 3) || jsonb_build_object('photo', jsonb_build_array(
      'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-4-1.webp',
      'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-4-2.webp',
      'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-4-3.webp'
    )),
    steps -> 4,
    (steps -> 5) || jsonb_build_object('photo', 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-6.webp'),
    (steps -> 6) || jsonb_build_object('photo', 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-7.webp'),
    (steps -> 7) || jsonb_build_object('photo', 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-8.webp')
  ),
  updated_at = now()
WHERE id = 'salad-baked-eggplant-tomatoes-tahini';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'salad-baked-eggplant-tomatoes-tahini'
      AND photo = 'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-cover.webp'
      AND steps -> 3 -> 'photo' = jsonb_build_array(
        'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-4-1.webp',
        'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-4-2.webp',
        'images/recipes/salad-baked-eggplant-tomatoes-tahini/salad-baked-eggplant-tomatoes-tahini-4-3.webp'
      )
  ) THEN
    RAISE EXCEPTION 'Recipe photo mapping did not persist as expected';
  END IF;
END $guard$;

COMMIT;

SELECT id, photo,
       steps -> 0 -> 'photo' AS step_1_photo,
       steps -> 3 -> 'photo' AS step_4_photos,
       steps -> 7 -> 'photo' AS step_8_photo
FROM recipes
WHERE id = 'salad-baked-eggplant-tomatoes-tahini';
