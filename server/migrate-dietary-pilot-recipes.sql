-- Pilot dietary metadata for three manually reviewed recipes.
--
-- This migration intentionally keeps dietary_verified = FALSE. It prepares the
-- metadata for admin review without changing recipe visibility for users.
-- Run only after migrate-dietary-preferences.sql.

BEGIN;

-- Neutral control recipe: no flags from the current supported set.
UPDATE recipes
SET dietary_flags = '{}',
    dietary_verified = FALSE
WHERE id = 'hummus';

-- Milk conflict without a replacement.
UPDATE recipes
SET dietary_flags = ARRAY['milk'],
    dietary_verified = FALSE,
    ingredients = (
      SELECT jsonb_agg(
        CASE
          WHEN lower(item->>'name') LIKE '%йогурт%'
            THEN item || jsonb_build_object('dietary_flags', jsonb_build_array('milk'))
          ELSE item
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(ingredients) WITH ORDINALITY AS x(item, ord)
    )
WHERE id = 'celeriac-apple-salad';

-- Milk conflict with a nut-based replacement, plus fish and gluten.
UPDATE recipes
SET dietary_flags = ARRAY['fish', 'milk', 'gluten'],
    dietary_verified = FALSE,
    ingredients = (
      SELECT jsonb_agg(
        CASE
          WHEN lower(item->>'name') LIKE '%паста%'
            THEN item || jsonb_build_object('dietary_flags', jsonb_build_array('gluten'))
          WHEN lower(item->>'name') LIKE '%тунец%'
            THEN item || jsonb_build_object('dietary_flags', jsonb_build_array('fish'))
          WHEN lower(item->>'name') LIKE '%йогурт%'
            THEN item || jsonb_build_object(
              'dietary_flags', jsonb_build_array('milk'),
              'swap_options', jsonb_build_array(
                jsonb_build_object(
                  'name', 'Соус из кешью',
                  'dietary_flags', jsonb_build_array('nuts')
                )
              )
            )
          ELSE item
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(ingredients) WITH ORDINALITY AS x(item, ord)
    )
WHERE id = 'pasta-tuna-yogurt';

COMMIT;
