-- Split mixed honey option in tofu-syrniki into separate omit and swap actions.
-- Apply:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-tofu-syrniki-split-honey-omit-swap-2026-06-12.sql

DO $$
DECLARE
  n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM recipes WHERE id = 'tofu-syrniki') THEN
    RAISE EXCEPTION 'tofu-syrniki not found';
  END IF;

  UPDATE recipes
  SET
    ingredients = (
      SELECT jsonb_agg(
        CASE
          WHEN item->>'name' = 'Мёд: 1 ч. л.' THEN
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(item, '{swap}', to_jsonb('Любой сироп'::text), true),
                  '{omit}', to_jsonb('Можно без него'::text), true
                ),
                '{omit_nutrition}', '{"kcal":21,"protein":0,"fat":0,"carbs":6,"fiber":0}'::jsonb, true
              ),
              '{omit_delta}', '{"kcal":-21,"protein":0,"fat":0,"carbs":-6,"fiber":0}'::jsonb, true
            )
          ELSE item
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(ingredients) WITH ORDINALITY AS t(item, ord)
    ),
    updated_at = now()
  WHERE id = 'tofu-syrniki';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected to update 1 tofu-syrniki row, updated %', n;
  END IF;
END $$;

SELECT jsonb_pretty(ingredients)
FROM recipes
WHERE id = 'tofu-syrniki';
