-- 033: Restore all portions after the legacy editor stripped `amount` fields.
-- The editor/API fix ships with this migration; it is safe to reapply only to blank amounts.

UPDATE recipes AS r
SET add_protein = (
  SELECT jsonb_agg(
    CASE
      WHEN COALESCE(addon->>'amount', '') <> '' THEN addon
      WHEN addon->>'name' = 'Готовое белое мясо' AND addon->>'kcal' = '80' THEN addon || '{"amount":"50 г"}'::jsonb
      WHEN addon->>'name' = 'Готовое белое мясо' AND addon->>'kcal' = '112' THEN addon || '{"amount":"70 г"}'::jsonb
      WHEN addon->>'name' = 'Твердый тофу' AND addon->>'kcal' = '78' THEN addon || '{"amount":"100 г"}'::jsonb
      WHEN addon->>'name' = 'Твердый тофу' AND addon->>'kcal' = '91' THEN addon || '{"amount":"130 г"}'::jsonb
      WHEN addon->>'name' = 'Йогурт 2–5%' THEN addon || '{"amount":"150 г"}'::jsonb
      WHEN addon->>'name' = 'Неактивные пищевые дрожжи' AND addon->>'kcal' = '48' THEN addon || '{"amount":"15 г"}'::jsonb
      WHEN addon->>'name' = 'Неактивные пищевые дрожжи' AND addon->>'kcal' = '40' THEN addon || '{"amount":"10 г"}'::jsonb
      WHEN addon->>'name' = 'Пармезан' AND addon->>'kcal' = '43' THEN addon || '{"amount":"10 г"}'::jsonb
      WHEN addon->>'name' = 'Пармезан' AND addon->>'kcal' = '59' THEN addon || '{"amount":"15 г"}'::jsonb
      WHEN addon->>'name' = 'Соевые бобы эдамаме' THEN addon || '{"amount":"100 г"}'::jsonb
      WHEN addon->>'name' = 'Творог 5%' THEN addon || '{"amount":"100 г"}'::jsonb
      WHEN addon->>'recipeId' IN ('hummus', 'beetroot-hummus') THEN addon || '{"amount":"40 г"}'::jsonb
      ELSE addon
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(COALESCE(r.add_protein, '[]'::jsonb)) WITH ORDINALITY AS source(addon, ordinality)
), updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(r.add_protein, '[]'::jsonb)) AS source(addon)
  WHERE COALESCE(addon->>'amount', '') = ''
);

UPDATE recipes AS r
SET add_carbs = (
  SELECT jsonb_agg(
    CASE WHEN COALESCE(addon->>'amount', '') = '' AND addon->>'name' = 'Цельнозерновой хлеб'
      THEN addon || '{"amount":"1 ломтик"}'::jsonb ELSE addon END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(COALESCE(r.add_carbs, '[]'::jsonb)) WITH ORDINALITY AS source(addon, ordinality)
), updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(r.add_carbs, '[]'::jsonb)) AS source(addon)
  WHERE COALESCE(addon->>'amount', '') = ''
);

UPDATE recipes AS r
SET add_fiber = (
  SELECT jsonb_agg(
    CASE
      WHEN COALESCE(addon->>'amount', '') = '' AND addon->>'name' = 'Ягоды' THEN addon || '{"amount":"80 г"}'::jsonb
      WHEN COALESCE(addon->>'amount', '') = '' AND addon->>'name' = 'Зелень' THEN addon || '{"amount":"25 г"}'::jsonb
      WHEN COALESCE(addon->>'amount', '') = '' AND addon->>'name' = 'Свежие овощи' THEN addon || '{"amount":"125 г"}'::jsonb
      ELSE addon
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(COALESCE(r.add_fiber, '[]'::jsonb)) WITH ORDINALITY AS source(addon, ordinality)
), updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(r.add_fiber, '[]'::jsonb)) AS source(addon)
  WHERE COALESCE(addon->>'amount', '') = ''
);

DO $$
DECLARE missing_amount_count integer;
BEGIN
  SELECT count(*) INTO missing_amount_count
  FROM (
    SELECT addon FROM recipes r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.add_protein, '[]'::jsonb)) AS source(addon)
    UNION ALL SELECT addon FROM recipes r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.add_fat, '[]'::jsonb)) AS source(addon)
    UNION ALL SELECT addon FROM recipes r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.add_carbs, '[]'::jsonb)) AS source(addon)
    UNION ALL SELECT addon FROM recipes r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.add_fiber, '[]'::jsonb)) AS source(addon)
  ) AS all_sidebar_addons
  WHERE COALESCE(addon->>'amount', '') = '';
  IF missing_amount_count <> 0 THEN
    RAISE EXCEPTION 'Sidebar add-ons without an amount remain: %', missing_amount_count;
  END IF;
END $$;
