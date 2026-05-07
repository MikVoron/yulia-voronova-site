-- Рецепт: Салат с морковью, огурцом и красным перцем

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, portion_grams,
  tags, photo, quote,
  ingredients, steps,
  is_published, sort_order
) VALUES (
  'carrot-cucumber-pepper-salad',
  'salads',
  'Салат с морковью, огурцом и красным перцем',
  '🥗',
  10, '10–15 минут', 'easy', 2, false,
  195, 7, 4, 21, 6, 250,
  ARRAY['растительный', 'без сои', 'без глютена'],
  'images/recipes/carrot-cucumber-pepper-salad/carrot-cucumber-pepper-salad-cover.webp',
  'Чтобы салат был свежим и ароматным, аккуратно смешивайте овощи с соусом непосредственно перед подачей.',
  '[
    {"name": "Морковь", "amount": "2 шт."},
    {"name": "Огурец свежий", "amount": "1 шт."},
    {"name": "Красный болгарский перец", "amount": "1 шт."},
    {"name": "Йогурт средней жирности", "amount": "80 г", "note": "или соус из кешью — 2 ст. л."},
    {"name": "Укроп", "amount": "2 ст. л.", "note": "мелко нарезанный"},
    {"name": "Кинза", "amount": "½ ст. л.", "note": "мелко нарезанная"},
    {"name": "Соль", "amount": "по вкусу"}
  ]',
  '[
    "Морковь натереть на крупной тёрке.",
    "Огурец натереть и слегка отжать сок.",
    "Красный перец нарезать соломкой или натереть.",
    "Смешать все овощи с йогуртом или соусом из кешью.",
    "Добавить зелень: укроп и кинзу.",
    "Посолить, аккуратно перемешать."
  ]',
  false, 0
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('carrot-cucumber-pepper-salad', 'salads')
ON CONFLICT DO NOTHING;
