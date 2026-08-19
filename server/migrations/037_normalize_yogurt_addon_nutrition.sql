-- Normalize the confirmed 150 g yogurt add-on values on every recipe card.
-- Safe to rerun: rows already matching the target nutrition are left untouched.
UPDATE recipes AS r
SET add_protein = (
  SELECT jsonb_agg(
    CASE
      WHEN addon->>'name' IN ('Йогурт 2-5%', 'Йогурт 2–5%')
        THEN addon || '{"name":"Йогурт 2–5%","amount":"150 г","kcal":95,"protein":8,"fat":3,"carbs":12,"fiber":0}'::jsonb
      ELSE addon
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(COALESCE(r.add_protein, '[]'::jsonb)) WITH ORDINALITY AS source(addon, ordinality)
),
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(r.add_protein, '[]'::jsonb)) AS source(addon)
  WHERE addon->>'name' IN ('Йогурт 2-5%', 'Йогурт 2–5%')
    AND addon IS DISTINCT FROM (addon || '{"name":"Йогурт 2–5%","amount":"150 г","kcal":95,"protein":8,"fat":3,"carbs":12,"fiber":0}'::jsonb)
);
