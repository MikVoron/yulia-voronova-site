-- Рецепт: Пшенники с яблоком (millet-pancakes-apple)
-- Подключаем cover + шаговые фото из images/recipes/millet-pancakes-apple/.
-- Только UPDATE — рецепт уже есть в БД.
--
-- Конвенция (см. server/migrate-recipe-photos-convention.sql):
--   • r.photo указывает на -final.webp. Фронт platform/recipe.html
--     автоматически выводит -start.webp после ингредиентов и -final.webp
--     как «Приятного аппетита» в самом конце.
--   • В steps[].photo НЕ должно быть -start и -final.
--   • Папка изначально называлась millet-apple-syrniki/, переименована
--     под recipe id = millet-pancakes-apple (см. images/recipes/).
--   • Маппинг -N.webp → step N (1-индексация):
--       шаг 4  → -4.webp  (смешать пшёнку, яблоко и мёд)
--       шаг 6  → -6.webp  (добавить рисовую муку)
--       шаг 7  → -7.webp  (перемешать и оставить на 10 мин)
--       шаг 8  → -8.webp  (сформировать оладьи)
--       шаг 11 → -11.webp (жарить под крышкой)
--   • Шаги 1, 2, 3, 5, 9, 10 фото не получают: реальных кадров нет.
--
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-recipe-millet-pancakes-apple-photos.sql

BEGIN;

UPDATE recipes
SET
  photo = 'images/recipes/millet-pancakes-apple/millet-pancakes-apple-final.webp',
  steps = '[
    {"text": "Натрите яблоки на мелкой тёрке.", "photo": null},
    {"text": "Хорошо отожмите руками, уберите лишний сок.", "photo": null},
    {"text": "При желании слегка пробейте пшёнку погружным блендером короткими импульсами, сохранив текстуру.", "photo": null},
    {"text": "Смешайте пшёнку, яблоко и мёд.", "photo": "images/recipes/millet-pancakes-apple/millet-pancakes-apple-4.webp"},
    {"text": "Если используете банан, просто разомните его вилкой и добавьте к другим ингредиентам.", "photo": null},
    {"text": "Добавьте рисовую муку.", "photo": "images/recipes/millet-pancakes-apple/millet-pancakes-apple-6.webp"},
    {"text": "Тщательно перемешайте и оставьте на 10 минут.", "photo": "images/recipes/millet-pancakes-apple/millet-pancakes-apple-7.webp"},
    {"text": "Сформируйте влажными руками оладьи.", "photo": "images/recipes/millet-pancakes-apple/millet-pancakes-apple-8.webp"},
    {"text": "Обваляйте в рисовой муке.", "photo": null},
    {"text": "Разогрейте сковороду с небольшим количеством масла.", "photo": null},
    {"text": "Жарьте под крышкой на огне чуть ниже среднего по 5 минут с каждой стороны до золотистой корочки.", "photo": "images/recipes/millet-pancakes-apple/millet-pancakes-apple-11.webp"}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'millet-pancakes-apple';

COMMIT;
