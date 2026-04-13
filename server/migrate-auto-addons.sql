-- Auto-addons rules for recipes and categories.
-- Format: { "protein": {"fromCategory": "meat"}, "fiber": {"fromCategory": "salads"}, ... }
-- Resolved at render time: recipe-level rule overrides category-level rule for the same slot.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS auto_addons JSONB DEFAULT '{}'::jsonb;
ALTER TABLE recipes    ADD COLUMN IF NOT EXISTS auto_addons JSONB DEFAULT '{}'::jsonb;

-- New category: Гарниры
INSERT INTO categories (id, name, emoji, color, sort_order, description)
VALUES ('sides', 'Гарниры', '🍚', '#d97706', 50, 'Крупы, картофель, паста — углеводная основа')
ON CONFLICT (id) DO NOTHING;
