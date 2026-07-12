-- cutlets-chickpea-mushroom-dill: подключить -12.webp к шагу 12 (жарка котлет на сковороде).
-- Файл images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-12.webp
-- лежал orphan: имя по конвенции -N.webp под последний шаг, но steps[11].photo был null.
-- Визуально подтверждено пользователем — это именно жарка, не дубль -final.webp.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-cutlets-step12-photo.sql

BEGIN;

UPDATE recipes
SET steps = jsonb_set(
      steps,
      '{11,photo}',
      '"images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-12.webp"'::jsonb
    ),
    updated_at = now()
WHERE id = 'cutlets-chickpea-mushroom-dill';

COMMIT;

-- Проверка
SELECT id, jsonb_array_length(steps) AS steps_count,
       steps->11->>'text' AS step12_text,
       steps->11->>'photo' AS step12_photo
FROM recipes
WHERE id = 'cutlets-chickpea-mushroom-dill';
