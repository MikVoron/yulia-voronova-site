-- The only confirmed filter replacement for this recipe is the cashew sauce.
-- Do not infer alternatives from the sauces catalog.

BEGIN;

UPDATE recipes
SET
  ingredients = (
    SELECT jsonb_agg(
      CASE
        WHEN lower(item->>'name') LIKE '%йогурт%'
          THEN (item - 'swap_options') || jsonb_build_object(
            'swap_options', jsonb_build_array(
              jsonb_build_object('name', 'Соус из кешью', 'dietary_flags', jsonb_build_array('nuts'))
            )
          )
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(ingredients) WITH ORDINALITY AS x(item, ord)
  ),
  updated_at = now()
WHERE id = 'carrot-cucumber-pepper-salad';

COMMIT;
