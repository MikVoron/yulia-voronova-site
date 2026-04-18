-- Миграция:
-- 1) Убрать 5 котлет из категории "Основные блюда" (mains)
-- 2) Добавить рецепт "Свекольный хумус"
-- 3) Обновить "Хумус" и "Соус из кешью" по новым данным

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Котлеты: убрать из mains
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE recipes
SET cat = 'cutlets'
WHERE id IN (
  'potato-quinoa-cutlets',
  'green-lentil-cutlets',
  'broccoli-rice-cutlets',
  'chickpea-eggplant-cutlets',
  'red-lentil-cutlets'
);

DELETE FROM recipe_categories
WHERE category_id = 'mains'
  AND recipe_id IN (
    'potato-quinoa-cutlets',
    'green-lentil-cutlets',
    'broccoli-rice-cutlets',
    'chickpea-eggplant-cutlets',
    'red-lentil-cutlets'
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Свекольный хумус (новый)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, portion_grams,
  tags, photo, quote,
  ingredients, steps,
  is_published, sort_order
) VALUES (
  'beetroot-hummus',
  'spreads',
  'Свекольный хумус',
  '🫙',
  5, 'easy', 5, false,
  150, 7, 7, 18, 6, 100,
  ARRAY['растительное', 'без сои', 'бобовые', 'до 15 мин', 'без глютена'],
  'images/recipes/beetroot-hummus/beetroot-hummus-cover.webp',
  'Нут можно отварить самим, можно взять консервированный. Вместо воды можно использовать аквафабу — воду из-под варки нута или жидкость из-под консервированного. Консистенцию регулируйте сами, хумус можно сделать гуще — в него удобнее макать кусочки овощей.',
  '[
    {"name": "Нут отварной — 300 г", "swap": null},
    {"name": "Свёкла запечённая — 200 г", "swap": null},
    {"name": "Тахини — 2 ст. л.", "swap": null},
    {"name": "Лимонный сок — 3–4 ст. л.", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Кумин — ½ ч. л.", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Вода — 90 мл", "swap": null}
  ]'::jsonb,
  '[
    "Все ингредиенты сложить в блендер и пробить до кремовой однородной текстуры.",
    "При необходимости добавить больше воды."
  ]'::jsonb,
  true, 6
) ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('beetroot-hummus', 'spreads')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Хумус — обновление
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE recipes
SET
  time_min = 5,
  difficulty = 'easy',
  servings = 5,
  portion_grams = 100,
  kcal = 200,
  protein = 8,
  fat = 12,
  carbs = 15,
  fiber = 5,
  tags = ARRAY['растительное', 'без сои', 'бобовые', 'до 15 мин', 'без глютена'],
  quote = 'Нут можно отварить самим, можно взять консервированный. Вместо воды можно использовать аквафабу — воду из-под варки нута или жидкость из-под консервированного. Консистенцию регулируйте сами, хумус можно сделать гуще — в него удобнее макать кусочки овощей.',
  ingredients = '[
    {"name": "Нут отварной — 400 г", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Лимон — 1 шт. (сок)", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Тахини — 3 ст. л.", "swap": null},
    {"name": "Кумин — 1,5 ч. л.", "swap": null},
    {"name": "Вода — 90 мл", "swap": null}
  ]'::jsonb,
  steps = '[
    "Все ингредиенты сложить в блендер и пробить до кремовой однородной текстуры.",
    "При необходимости добавить больше воды."
  ]'::jsonb
WHERE id = 'hummus';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Соус из кешью — обновление
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE recipes
SET
  time_min = 5,
  difficulty = 'easy',
  servings = 25,
  portion_grams = 15,
  kcal = 70,
  protein = 2,
  fat = 5,
  carbs = 5,
  fiber = 0.5,
  tags = ARRAY['растительное', 'без сои', 'до 15 мин', 'без глютена'],
  quote = 'Для густого соуса используйте около 100 мл воды, для более жидкого — 150–200 мл. Храните в холодильнике до 4–5 дней.',
  ingredients = '[
    {"name": "Кешью (сырой) — 200 г", "swap": null},
    {"name": "Вода — 150 мл", "swap": null},
    {"name": "Чеснок — 1–2 зубчика", "swap": null},
    {"name": "Сок половины среднего лимона", "swap": null},
    {"name": "Соль — 0,5 ч. л.", "swap": null}
  ]'::jsonb,
  steps = '[
    "Замочить кешью минимум на 4–6 часов, можно на ночь.",
    "Замоченный кешью слить и промыть.",
    "Сложить все ингредиенты в блендер, взбить до кремовой однородной текстуры."
  ]'::jsonb
WHERE id = 'cashew-sauce';

COMMIT;

-- Проверка
SELECT 'CUTLETS AFTER:' AS info;
SELECT r.id, r.name, r.cat, array_agg(rc.category_id) AS cats
FROM recipes r
LEFT JOIN recipe_categories rc ON rc.recipe_id = r.id
WHERE r.id LIKE '%cutlet%'
GROUP BY r.id, r.name, r.cat
ORDER BY r.name;

SELECT 'SPREADS AFTER:' AS info;
SELECT id, name, kcal, protein, fat, carbs, fiber, portion_grams, servings, time_min
FROM recipes
WHERE id IN ('beetroot-hummus', 'hummus', 'cashew-sauce')
ORDER BY id;
