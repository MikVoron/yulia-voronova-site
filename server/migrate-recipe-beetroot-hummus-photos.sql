-- Рецепт: Свекольный хумус (beetroot-hummus)
-- Подключаем cover из images/recipes/beetroot-hummus/.
-- Только UPDATE — рецепт уже есть в БД.
--
-- Конвенция (см. server/migrate-recipe-photos-convention.sql):
--   • r.photo указывает на -final.webp. Фронт platform/recipe.html
--     автоматически выводит -start.webp после ингредиентов и -final.webp
--     как «Приятного аппетита» в самом конце.
--   • В steps[].photo НЕ должно быть -start и -final.
--   • У рецепта 2 шага в legacy string-формате; шаговые фото отсутствуют.
--     Формат steps оставляем как есть, чтобы не смешивать задачи.
--
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-recipe-beetroot-hummus-photos.sql

BEGIN;

UPDATE recipes
SET
  photo = 'images/recipes/beetroot-hummus/beetroot-hummus-final.webp',
  updated_at = now()
WHERE id = 'beetroot-hummus';

COMMIT;
