-- Рецепт: Суп с гречкой и киноа (buckwheat-quinoa-soup)
-- Подключаем реальный фотосет из images/recipes/buckwheat-quinoa-soup/.
-- Только UPDATE — рецепт уже вставлен через server/migrate-three-soups.sql.
--
-- Конвенция (см. server/migrate-recipe-photos-convention.sql):
--   • r.photo указывает на cover (-final.webp). Фронт platform/recipe.html
--     автоматически выводит -start.webp как «Ингредиенты» после списка
--     ингредиентов и -final.webp как «Приятного аппетита» в самом конце.
--   • В steps[].photo НЕ должно быть -start и -final.
--   • Имена файлов 1..5 оставлены как есть и привязаны к шагам по смыслу
--     кадра (4–8). Шаги 1–3 и 9 фото не получают: реальных кадров нет.
--
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-recipe-buckwheat-quinoa-soup-photos.sql

BEGIN;

UPDATE recipes
SET
  photo = 'images/recipes/buckwheat-quinoa-soup/buckwheat-quinoa-soup-final.webp',
  steps = '[
    {"text": "Нарежьте все овощи мелкими кубиками.", "photo": null},
    {"text": "Обжарьте лук и чеснок на масле 1 минуту.", "photo": null},
    {"text": "Добавьте морковь и сельдерей, тушите 2 минуты.", "photo": null},
    {"text": "Добавьте специи, перемешайте.", "photo": "images/recipes/buckwheat-quinoa-soup/buckwheat-quinoa-soup-1.webp"},
    {"text": "Добавьте томатную пасту, перемешайте.", "photo": "images/recipes/buckwheat-quinoa-soup/buckwheat-quinoa-soup-2.webp"},
    {"text": "Добавьте гречку и киноа, перемешайте.", "photo": "images/recipes/buckwheat-quinoa-soup/buckwheat-quinoa-soup-3.webp"},
    {"text": "Влейте воду.", "photo": "images/recipes/buckwheat-quinoa-soup/buckwheat-quinoa-soup-4.webp"},
    {"text": "Добавьте картофель, грибы и овощной концентрат (можно без него).", "photo": "images/recipes/buckwheat-quinoa-soup/buckwheat-quinoa-soup-5.webp"},
    {"text": "Накройте крышкой и варите 20–30 минут до готовности круп.", "photo": null}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'buckwheat-quinoa-soup';

COMMIT;
