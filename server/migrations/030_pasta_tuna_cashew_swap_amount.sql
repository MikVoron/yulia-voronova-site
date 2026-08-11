-- Keep the live pasta recipe in sync with the replacement amount shown on its card.
-- Safe to rerun: only updates the expected yogurt ingredient in this one recipe.
BEGIN;

UPDATE recipes
SET ingredients = (
  SELECT jsonb_agg(
    CASE
      WHEN item->>'name' ~ '^Йогурт(?: средней жирности)?\s*[:—–-]\s*100\s*г\.?$'
        THEN jsonb_set(item, '{swap}', '"[Соус из кешью](cashew-sauce) — 50 г"'::jsonb)
      ELSE item
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(ingredients) WITH ORDINALITY AS x(item, ord)
)
WHERE id = 'pasta-tuna-yogurt'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(ingredients) AS x(item)
    WHERE item->>'name' ~ '^Йогурт(?: средней жирности)?\s*[:—–-]\s*100\s*г\.?$'
  );

COMMIT;
