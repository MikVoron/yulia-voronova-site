-- 031: Sidebar add-on labels, portions, and KBZHU normalization.
-- Scope: only add_* JSONB arrays plus the confirmed 40 g portions of hummus recipes.
-- All values are per displayed add-on portion, not per 100 g.

DO $$
DECLARE
  addon_count integer;
BEGIN
  SELECT count(*) INTO addon_count
  FROM recipes r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.add_protein, '[]'::jsonb)) AS addon
  WHERE addon->>'name' IN ('Белое мясо', 'Белое мясо готовое', 'Готовое белое мясо');

  IF addon_count <> 11 THEN
    RAISE EXCEPTION 'Expected 11 ready white meat sidebar add-ons, found %', addon_count;
  END IF;

  SELECT count(*) INTO addon_count
  FROM recipes r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.add_protein, '[]'::jsonb)) AS addon
  WHERE addon->>'name' IN ('Тофу', 'Твердый тофу', 'Твёрдый тофу');

  IF addon_count <> 10 THEN
    RAISE EXCEPTION 'Expected 10 firm tofu sidebar add-ons, found %', addon_count;
  END IF;
END $$;

UPDATE recipes AS r
SET add_protein = (
  SELECT jsonb_agg(
    CASE
      -- Ready white meat: exact values confirmed for each portion.
      WHEN addon->>'name' IN ('Белое мясо', 'Белое мясо готовое', 'Готовое белое мясо')
           AND r.id IN (
             'green-lentil-millet-soup', 'borscht-red-beans', 'red-lentil-mushroom-soup',
             'shchi-white-beans', 'red-lentil-vegetable-soup', 'soup-red-lentil-bulgur',
             'soup-lentil-carrot'
           )
        THEN addon || '{"name":"Готовое белое мясо","amount":"50 г","kcal":80,"protein":16,"fat":3,"carbs":0,"fiber":0}'::jsonb
      WHEN addon->>'name' IN ('Белое мясо', 'Белое мясо готовое', 'Готовое белое мясо')
           AND r.id IN ('buckwheat-quinoa-soup', 'mung-bean-soup', 'chickpea-noodle-soup')
        THEN addon || '{"name":"Готовое белое мясо","amount":"70 г","kcal":112,"protein":22,"fat":3,"carbs":0,"fiber":0}'::jsonb
      -- The existing KBZHU for the pancake option is retained; only its confirmed 100 g portion and canonical label are added.
      WHEN addon->>'name' IN ('Белое мясо', 'Белое мясо готовое', 'Готовое белое мясо')
           AND r.id = 'green-buckwheat-pancakes'
        THEN addon || '{"name":"Готовое белое мясо","amount":"100 г"}'::jsonb

      -- Firm tofu: canonical label and user-confirmed values.
      WHEN addon->>'name' IN ('Тофу', 'Твердый тофу', 'Твёрдый тофу')
           AND r.id IN (
             'green-lentil-millet-soup', 'borscht-red-beans', 'red-lentil-mushroom-soup',
             'shchi-white-beans', 'red-lentil-vegetable-soup', 'soup-red-lentil-bulgur',
             'soup-lentil-carrot'
           )
        THEN addon || '{"name":"Твердый тофу","amount":"100 г","kcal":78,"protein":9,"fat":5,"carbs":2,"fiber":1}'::jsonb
      WHEN addon->>'name' IN ('Тофу', 'Твердый тофу', 'Твёрдый тофу')
           AND r.id IN ('buckwheat-quinoa-soup', 'mung-bean-soup', 'chickpea-noodle-soup')
        THEN addon || '{"name":"Твердый тофу","amount":"130 г","kcal":91,"protein":13,"fat":3,"carbs":3,"fiber":1}'::jsonb

      -- Yogurt 2–5%: one canonical spelling and one 150 g portion.
      WHEN addon->>'name' IN ('Йогурт 2-5%', 'Йогурт 2–5%')
           AND r.id IN (
             'millet-pancakes-apple', 'green-buckwheat-pancakes', 'lentil-pancakes-gf',
             'carrot-pancakes', 'oat-pancakes', 'wholegrain-flour-pancakes', 'oatmeal',
             'baked-oatmeal-apples-cinnamon', 'millet-porridge'
           )
        THEN addon || '{"name":"Йогурт 2–5%","amount":"150 г","kcal":95,"protein":8,"fat":2,"carbs":10,"fiber":0}'::jsonb

      WHEN addon->>'name' = 'Неактивные пищевые дрожжи' AND r.id = 'grechotto'
        THEN addon || '{"amount":"15 г","kcal":48,"protein":7,"fat":1,"carbs":5,"fiber":3}'::jsonb
      WHEN addon->>'name' = 'Неактивные пищевые дрожжи' AND r.id = 'pasta-tomato-roasted-peppers'
        THEN addon || '{"amount":"10 г","kcal":40,"protein":5,"fat":0,"carbs":3,"fiber":2}'::jsonb
      WHEN addon->>'name' = 'Пармезан' AND r.id = 'grechotto'
        THEN addon || '{"amount":"10 г","kcal":43,"protein":4,"fat":3,"carbs":0,"fiber":0}'::jsonb
      WHEN addon->>'name' = 'Пармезан' AND r.id = 'pasta-tomato-roasted-peppers'
        THEN addon || '{"amount":"15 г","kcal":59,"protein":6,"fat":4,"carbs":1,"fiber":0}'::jsonb
      WHEN addon->>'name' = 'Слабосолёная жирная рыба' AND r.id = 'green-buckwheat-pancakes'
        THEN addon || '{"amount":"80 г","kcal":135,"protein":15,"fat":8,"carbs":0,"fiber":0}'::jsonb
      WHEN addon->>'name' IN ('Соевые бобы эдамаме', 'Эдамаме')
        THEN addon || '{"name":"Соевые бобы эдамаме","amount":"100 г","kcal":109,"protein":12,"fat":5,"carbs":3,"fiber":5}'::jsonb
      WHEN addon->>'name' = 'Творог 5%'
        THEN addon || '{"amount":"100 г","kcal":121,"protein":17,"fat":5,"carbs":3,"fiber":0}'::jsonb
      WHEN addon->>'name' = 'Тунец/рыбные консервы'
        THEN addon || '{"name":"Консервированный тунец","amount":"80 г","kcal":110,"protein":18,"fat":3,"carbs":0,"fiber":0}'::jsonb
      WHEN addon->>'recipeId' = 'hummus'
        THEN addon || '{"name":"Хумус","amount":"40 г"}'::jsonb
      WHEN addon->>'recipeId' = 'beetroot-hummus'
        THEN addon || '{"name":"Свекольный хумус","amount":"40 г"}'::jsonb
      ELSE addon
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(COALESCE(r.add_protein, '[]'::jsonb)) WITH ORDINALITY AS source(addon, ordinality)
),
    updated_at = now()
WHERE r.id IN (
  'green-lentil-millet-soup', 'borscht-red-beans', 'red-lentil-mushroom-soup',
  'shchi-white-beans', 'red-lentil-vegetable-soup', 'soup-red-lentil-bulgur',
  'soup-lentil-carrot', 'buckwheat-quinoa-soup', 'mung-bean-soup', 'chickpea-noodle-soup',
  'green-buckwheat-pancakes', 'millet-pancakes-apple', 'lentil-pancakes-gf',
  'carrot-pancakes', 'oat-pancakes', 'wholegrain-flour-pancakes', 'oatmeal',
  'baked-oatmeal-apples-cinnamon', 'millet-porridge', 'grechotto',
  'pasta-tomato-roasted-peppers'
);

UPDATE recipes AS r
SET add_carbs = (
  SELECT jsonb_agg(
    CASE WHEN addon->>'name' IN ('Цельнозерновой хлеб', 'Цельнозерновой хлеб — 1 ломтик')
      THEN addon || '{"name":"Цельнозерновой хлеб","amount":"1 ломтик","kcal":70,"protein":3,"fat":0,"carbs":15,"fiber":3}'::jsonb
      ELSE addon
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(COALESCE(r.add_carbs, '[]'::jsonb)) WITH ORDINALITY AS source(addon, ordinality)
),
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(r.add_carbs, '[]'::jsonb)) AS source(addon)
  WHERE addon->>'name' IN ('Цельнозерновой хлеб', 'Цельнозерновой хлеб — 1 ломтик')
);

UPDATE recipes AS r
SET add_fiber = (
  SELECT jsonb_agg(
    CASE
      WHEN addon->>'name' = 'Ягоды'
        THEN addon || '{"amount":"80 г","kcal":32,"protein":1,"fat":0,"carbs":7,"fiber":3}'::jsonb
      WHEN addon->>'name' = 'Зелень'
        THEN addon || '{"amount":"25 г","kcal":6,"protein":1,"fat":0,"carbs":1,"fiber":1}'::jsonb
      WHEN addon->>'name' = 'Свежие овощи'
        THEN addon || '{"amount":"125 г","kcal":25,"protein":1,"fat":0,"carbs":5,"fiber":3}'::jsonb
      ELSE addon
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(COALESCE(r.add_fiber, '[]'::jsonb)) WITH ORDINALITY AS source(addon, ordinality)
),
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(r.add_fiber, '[]'::jsonb)) AS source(addon)
  WHERE addon->>'name' IN ('Ягоды', 'Зелень', 'Свежие овощи')
);

UPDATE recipes
SET portion_grams = 40,
    updated_at = now()
WHERE id IN ('hummus', 'beetroot-hummus');

-- Postcondition: the entries for all named products now expose a portion.
DO $$
DECLARE
  missing_amount_count integer;
BEGIN
  SELECT count(*) INTO missing_amount_count
  FROM recipes r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.add_protein, '[]'::jsonb)) AS addon
  WHERE addon->>'name' IN (
    'Готовое белое мясо', 'Твердый тофу', 'Йогурт 2–5%',
    'Неактивные пищевые дрожжи', 'Пармезан', 'Свекольный хумус',
    'Слабосолёная жирная рыба', 'Соевые бобы эдамаме', 'Творог 5%',
    'Консервированный тунец', 'Хумус'
  )
  AND COALESCE(addon->>'amount', '') = '';

  IF missing_amount_count <> 0 THEN
    RAISE EXCEPTION 'Sidebar add-ons still missing a confirmed amount: %', missing_amount_count;
  END IF;
END $$;
