-- Новые категории: Основа + Хлеб и Крекеры
-- + перенос рецептов из mains

BEGIN;

-- 1. Создать категории
INSERT INTO categories (id, name, emoji, color, sort_order)
VALUES
  ('bases',   'Основа',           '🫕', '#b8956a', 7),
  ('breads',  'Хлеб и Крекеры',   '🍞', '#c9a96e', 8)
ON CONFLICT (id) DO NOTHING;

-- 2. Перенести рецепты: обновить primary cat
UPDATE recipes SET cat = 'bases'  WHERE id IN ('veggie-concentrate', 'clear-broth', 'dark-broth');
UPDATE recipes SET cat = 'breads' WHERE id IN ('oregano-croutons', 'ww-crackers');

-- 3. Обновить recipe_categories: удалить старую привязку к mains, добавить новую
DELETE FROM recipe_categories WHERE recipe_id IN ('veggie-concentrate', 'clear-broth', 'dark-broth') AND category_id = 'mains';
DELETE FROM recipe_categories WHERE recipe_id IN ('oregano-croutons', 'ww-crackers') AND category_id = 'mains';

INSERT INTO recipe_categories (recipe_id, category_id) VALUES
  ('veggie-concentrate', 'bases'),
  ('clear-broth',        'bases'),
  ('dark-broth',         'bases'),
  ('oregano-croutons',   'breads'),
  ('ww-crackers',        'breads')
ON CONFLICT DO NOTHING;

COMMIT;
