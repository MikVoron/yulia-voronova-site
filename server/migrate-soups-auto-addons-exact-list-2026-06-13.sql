-- Move soup bread add-ons from hardcoded frontend fallback into category auto_addons.
-- Soups need an exact list, not "fromCategory: breads", because that would pull all bread recipes.

BEGIN;

UPDATE categories
SET auto_addons = jsonb_set(
      COALESCE(auto_addons, '{}'::jsonb),
      '{carbs}',
      '{
        "items": [
          {"name": "Цельнозерновой хлеб", "amount": "1 ломтик", "kcal": 70, "protein": 3, "fat": 0, "carbs": 15, "fiber": 3},
          {"recipeId": "oregano-croutons"}
        ]
      }'::jsonb,
      true
    )
WHERE id = 'soups';

SELECT id, auto_addons
FROM categories
WHERE id = 'soups';

COMMIT;
