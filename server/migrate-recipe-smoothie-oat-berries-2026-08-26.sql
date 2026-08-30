-- Рецепт: Смузи с овсянкой и ягодами.
-- Доступ: бесплатный. Статус: неопубликованный черновик по умолчанию контракта.
-- Фото: images/recipes/smoothie-oat-berries/ (cover, start, final).
-- Применить на VPS:
--   scp server/migrate-recipe-smoothie-oat-berries-2026-08-26.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql -d smartplate_db -f /tmp/migrate-recipe-smoothie-oat-berries-2026-08-26.sql"

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM recipes WHERE id = 'smoothie-oat-berries') THEN
    RAISE EXCEPTION 'Recipe smoothie-oat-berries already exists; refusing to overwrite it.';
  END IF;
END $guard$;

INSERT INTO recipes (
  id, cat, name, emoji, time_min, time_label, difficulty, servings,
  is_free, access_level, kcal, protein, fat, carbs, fiber, tags, photo,
  quote, note, ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, auto_addons, is_soup,
  main_ingredients, dietary_flags, dietary_verified
) VALUES (
  'smoothie-oat-berries',
  'drinks',
  'Смузи с овсянкой и ягодами',
  NULL,
  5,
  NULL,
  'easy',
  1,
  true,
  'free',
  420, 15, 15, 58, 10,
  ARRAY['растительное'],
  'images/recipes/smoothie-oat-berries/smoothie-oat-berries-cover.webp',
  'Благодаря клетчатке из овсянки и ягод, а также полезным жира из арахисовой пасты и белку, смузи дает долгое чувство сытости - после такого завтрака вам долго не захочется ничего перекусывать.',
  'С таким количеством молока смузи получится густым, его удобно есть ложкой. Если хотите более жидкий, питьевой вариант, просто доведите молоко до 200 мл.',
  '[
    {"name": "Овсяные хлопья: 40 г", "swap": null},
    {"name": "Арахисовая паста: 20 г", "swap": null, "dietary_flags": ["peanuts"]},
    {"name": "Банан: 100 г", "swap": null},
    {"name": "Чёрная смородина/ежевика/малина (свежие или замороженные): 70 г", "swap": null},
    {
      "name": "Соевое молоко: 100 мл",
      "swap": "Овсяное молоко: 100 мл",
      "dietary_flags": ["soy"],
      "swap_options": [
        {"name": "Овсяное молоко: 100 мл", "dietary_flags": []}
      ],
      "swap_nutrition": {
        "original": {"kcal": 33, "protein": 3, "fat": 2, "carbs": 1, "fiber": 0},
        "replacement": {"kcal": 48, "protein": 1, "fat": 2, "carbs": 7, "fiber": 1},
        "replacements": [
          {"name": "Овсяное молоко", "nutrition": {"kcal": 48, "protein": 1, "fat": 2, "carbs": 7, "fiber": 1}}
        ]
      }
    }
  ]'::jsonb,
  '[
    {"text": "Сложите все ингредиенты в блендер."},
    {"text": "Взбейте до однородной гладкой консистенции."},
    {"text": "Замороженные ягоды предварительно размораживать не нужно. Овсяные хлопья используйте сухими, без предварительного приготовления."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  350,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['oats'],
  ARRAY['peanuts', 'soy'],
  true
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('smoothie-oat-berries', 'drinks');

COMMIT;

SELECT r.id, r.cat, r.name, r.access_level, r.is_free, r.is_published,
       r.photo, r.main_ingredients, r.dietary_flags, r.dietary_verified,
       array_agg(rc.category_id ORDER BY rc.category_id) AS categories
FROM recipes r
JOIN recipe_categories rc ON rc.recipe_id = r.id
WHERE r.id = 'smoothie-oat-berries'
GROUP BY r.id, r.cat, r.name, r.access_level, r.is_free, r.is_published,
         r.photo, r.main_ingredients, r.dietary_flags, r.dietary_verified;
