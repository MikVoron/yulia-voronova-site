-- Correct the default dietary classification of the carrot-cucumber-pepper salad.
-- The recipe contains dairy yogurt by default; its plant-based alternatives are
-- structured separately so cabinet dietary filtering can handle allowed swaps.

BEGIN;

UPDATE recipes
SET
  tags = array_remove(COALESCE(tags, ARRAY[]::TEXT[]), 'растительное'),
  dietary_flags = ARRAY['milk'],
  dietary_verified = TRUE,
  ingredients = (
    SELECT jsonb_agg(
      CASE
        WHEN lower(item->>'name') LIKE '%йогурт%'
          THEN (item - 'swap_options') || jsonb_build_object(
            'dietary_flags', jsonb_build_array('milk'),
            'swap_options', jsonb_build_array(
              jsonb_build_object('name', 'Соус из кешью', 'dietary_flags', jsonb_build_array('nuts')),
              jsonb_build_object('name', 'Соус из фасоли', 'dietary_flags', jsonb_build_array())
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
