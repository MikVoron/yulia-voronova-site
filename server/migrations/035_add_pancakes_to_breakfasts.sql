-- Все рецепты из категории «Блины и оладьи» также показываем в «Завтраках».
-- Основная категория recipes.cat и привязка к pancakes остаются без изменений.
-- Миграция идемпотентна: её безопасно запускать повторно.

BEGIN;

INSERT INTO recipe_categories (recipe_id, category_id)
SELECT rc.recipe_id, 'breakfasts'
FROM recipe_categories rc
JOIN categories breakfast_category ON breakfast_category.id = 'breakfasts'
WHERE rc.category_id = 'pancakes'
ON CONFLICT (recipe_id, category_id) DO NOTHING;

COMMIT;

-- Проверка результата: все рецепты «Блинов и оладий» должны быть также в «Завтраках».
SELECT r.id, r.name, array_agg(rc.category_id ORDER BY rc.category_id) AS categories
FROM recipes r
JOIN recipe_categories rc ON rc.recipe_id = r.id
WHERE r.id IN (
  SELECT recipe_id
  FROM recipe_categories
  WHERE category_id = 'pancakes'
)
GROUP BY r.id, r.name
ORDER BY r.name;
