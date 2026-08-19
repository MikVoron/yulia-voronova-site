-- Рецепт: Блины из цельнозерновой муки.
-- Новый неопубликованный рецепт; фото будут добавлены отдельной задачей.
-- Эмодзи не используется. sort_order=0 назначается при публикации.
-- Применить:
--   scp server/migrate-recipe-wholegrain-wheat-pancakes-2026-08-19.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql -d smartplate_db -f /tmp/migrate-recipe-wholegrain-wheat-pancakes-2026-08-19.sql"

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM recipes WHERE id = 'wholegrain-wheat-pancakes') THEN
    RAISE EXCEPTION 'Recipe wholegrain-wheat-pancakes already exists; refusing to overwrite it.';
  END IF;
END $guard$;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  main_ingredients, portion_grams, is_published, sort_order,
  dietary_flags, dietary_verified
) VALUES (
  'wholegrain-wheat-pancakes',
  'pancakes',
  'Блины из цельнозерновой муки',
  NULL,
  40,
  NULL,
  'medium',
  16,
  false,
  140, 4, 2, 26, 4,
  ARRAY['растительное', 'без сои'],
  NULL,
  'Эти блины получаются чуть толще, чем на белой муке, но при этом они богаты клетчаткой и отлично сочетаются с белковыми начинками. Если хочется сладкого варианта, просто добавьте в готовое тесто немного мёда или другого подсластителя.',
  NULL,
  '[
    {"name": "Мука цельнозерновая: 500 г", "swap": null, "dietary_flags": ["gluten"]},
    {
      "name": "Овсяное молоко: 500 мл",
      "swap": "Соевое молоко; Коровье молоко 2,5%",
      "swap_options": [
        {"name": "Соевое молоко", "dietary_flags": []},
        {"name": "Коровье молоко 2,5%", "dietary_flags": ["milk"]}
      ],
      "swap_nutrition": {
        "original": {"kcal": 14, "protein": 0, "fat": 1, "carbs": 2, "fiber": 0},
        "replacement": {"kcal": 10, "protein": 1, "fat": 1, "carbs": 0, "fiber": 0},
        "replacements": [
          {"name": "Соевое молоко", "nutrition": {"kcal": 10, "protein": 1, "fat": 1, "carbs": 0, "fiber": 0}},
          {"name": "Коровье молоко 2,5%", "nutrition": {"kcal": 18, "protein": 1, "fat": 1, "carbs": 1, "fiber": 0}}
        ]
      }
    },
    {"name": "Газированная вода: 500 мл", "swap": null},
    {"name": "Растительное масло: 1 ст. л.", "swap": null},
    {"name": "Соль: 0,5 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "В миске смешайте муку с солью."},
    {"text": "Добавьте растительное масло и овсяное молоко, перемешайте ложкой до однородности."},
    {"text": "Влейте газированную воду и хорошо перемешайте тесто до гладкой консистенции без комочков."},
    {"text": "Разогрейте сковороду, слегка смажьте её оливковым маслом и вылейте тонкий слой теста."},
    {"text": "Жарьте на среднем огне до появления дырочек на поверхности, затем аккуратно переверните блин и обжарьте с другой стороны."}
  ]'::jsonb,
  '[
    {"name": "Йогурт 2–5%", "amount": "150 г", "kcal": 95, "protein": 7.5, "fat": 2.5, "carbs": 10.5, "fiber": 0},
    {"name": "Творог 5%", "amount": "100 г", "kcal": 121, "protein": 17, "fat": 5, "carbs": 3, "fiber": 0},
    {"name": "Белое мясо", "amount": "100 г", "kcal": 110, "protein": 23, "fat": 2, "carbs": 0, "fiber": 0},
    {"name": "Слабосолёная жирная рыба", "amount": "80 г", "kcal": 135, "protein": 15, "fat": 8, "carbs": 0, "fiber": 0},
    {"name": "Тунец/рыбные консервы", "amount": "80 г", "kcal": 110, "protein": 18, "fat": 3, "carbs": 0, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  ARRAY[]::text[],
  75,
  false,
  0,
  ARRAY['gluten'],
  true
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('wholegrain-wheat-pancakes', 'pancakes');

COMMIT;

SELECT id, cat, name, emoji, time_min, difficulty, servings, portion_grams,
       kcal, protein, fat, carbs, fiber, tags, photo, is_published,
       sort_order, dietary_flags, dietary_verified
FROM recipes
WHERE id = 'wholegrain-wheat-pancakes';
