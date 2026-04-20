-- Рецепт: Борщ с красной фасолью
-- Запустить на VPS: psql $DATABASE_URL < migrate-borsch.sql

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_carbs,
  portion_grams, is_published, sort_order
) VALUES (
  'borscht-red-beans',
  'mains',
  'Борщ с красной фасолью',
  '🥣',
  45,
  'medium',
  10,
  false,
  123, 6, 2, 23, 6,
  ARRAY['без глютена', 'растительное', 'без сои', 'бобовые'],
  'images/recipes/borscht-red-beans/borsch-cover.webp',
  'Фасоль в борщ можно положить целой. Моему сыну так не нравится, поэтому я её пюрирую. Люблю варить борщ на овощном бульоне и добавлять белок порционно - белое мясо, если едите, или тофу. Вкусно с цельнозерновым хлебом, намазанным хумусом.',
  '[
    {"name": "Вода", "amount": "3 л"},
    {"name": "Картофель", "amount": "2 средние"},
    {"name": "Белокочанная капуста", "amount": "800 г"},
    {"name": "Красная фасоль", "amount": "350 г (отварная или консервированная)"},
    {"name": "Свёкла", "amount": "3 средние (запечённая или отварная)"},
    {"name": "Лук", "amount": "1 крупный"},
    {"name": "Морковь", "amount": "2 средние"},
    {"name": "Сельдерей", "amount": "2 стебля"},
    {"name": "Оливковое масло", "amount": "1 ст. л."},
    {"name": "Томатная паста", "amount": "2 ст. л. (можно заменить: томаты в собственном соку - 200 г)"},
    {"name": "Паприка", "amount": "1 ч. л."},
    {"name": "Кориандр", "amount": "1/2 ч. л."},
    {"name": "Лавровый лист", "amount": "2 шт."},
    {"name": "Чеснок", "amount": "2 зубчика"},
    {"name": "Лимонный сок", "amount": "1 ст. л."},
    {"name": "Укроп", "amount": "25 г (можно заменить на петрушку)"},
    {"name": "Соль", "amount": "по вкусу"}
  ]'::jsonb,
  '[
    {"text": "Лук мелко нарезьте, сельдерей и картофель нарезьте кубиками, морковь натрите, зелень порубите."},
    {"text": "В кипящую воду добавьте картофель, капусту и лавровый лист."},
    {"text": "Добавьте овощной концентрат (можно без него) и варите 10 минут."},
    {"text": "На сковороде разогрейте масло. Обжарьте лук 1 минуту."},
    {"text": "Добавьте морковь и сельдерей, готовьте ещё 5 минут."},
    {"text": "Добавьте половину зелени и специи, перемешайте."},
    {"text": "Добавьте томатную пасту, перемешайте."},
    {"text": "Переложите зажарку в кастрюлю, варите 10 минут."},
    {"text": "Свёклу натрите и добавьте в суп."},
    {"text": "Добавьте чеснок и лимонный сок.", "photo": ["images/recipes/borscht-red-beans/borsch-10.1.webp", "images/recipes/borscht-red-beans/borsch-10.2.webp"]},
    {"text": "Фасоль пробейте блендером с 1-2 половниками бульона."},
    {"text": "Добавьте фасоль в суп, перемешайте."},
    {"text": "Добавьте оставшуюся зелень."}
  ]'::jsonb,
  '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 1, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "100 г", "kcal": 70, "protein": 10, "fat": 4, "carbs": 1, "fiber": 0},
    {"name": "Хумус", "amount": "40 г", "kcal": 120, "protein": 3, "fat": 6, "carbs": 13, "fiber": 2, "recipeId": "hummus"},
    {"name": "Хумус со свёклой", "amount": "40 г", "kcal": 110, "protein": 3, "fat": 6, "carbs": 12, "fiber": 2, "recipeId": "beet-hummus"}
  ]'::jsonb,
  '[
    {"name": "Цельнозерновой хлеб", "amount": "1 шт.", "kcal": 70, "protein": 3, "fat": 1, "carbs": 15, "fiber": 3}
  ]'::jsonb,
  400,
  false,
  1
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
  difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  is_free = EXCLUDED.is_free,
  kcal = EXCLUDED.kcal,
  protein = EXCLUDED.protein,
  fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs,
  fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags,
  photo = EXCLUDED.photo,
  quote = EXCLUDED.quote,
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_carbs = EXCLUDED.add_carbs,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('borscht-red-beans', 'mains')
ON CONFLICT DO NOTHING;
