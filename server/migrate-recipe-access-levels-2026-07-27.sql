-- SmartPlate recipe access levels, 2026-07-27.
-- Product decision: 12 free, 18 trial, every other recipe pro.
-- Safe to re-run: targets are explicit and all remaining recipes are pro.

BEGIN;

LOCK TABLE recipes IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE recipe_access_targets (
  id TEXT PRIMARY KEY,
  access_level TEXT NOT NULL CHECK (access_level IN ('free', 'trial'))
) ON COMMIT DROP;

INSERT INTO recipe_access_targets (id, access_level) VALUES
  -- Free: available without registration.
  ('grechotto', 'free'),
  ('cutlets-chickpea-mushroom-dill', 'free'),
  ('vegetable-plate', 'free'),
  ('hummus', 'free'),
  ('veggie-concentrate', 'free'),
  ('red-lentil-bread', 'free'),
  ('nut-omelet', 'free'),
  ('lentil-pancakes-gf', 'free'),
  ('beetroot-bean-arugula', 'free'),
  ('cashew-sauce', 'free'),
  ('side-potato-celery-puree', 'free'),
  ('mung-bean-soup', 'free'),

  -- Trial: available after registration during the trial period and to Pro.
  ('millet-pancakes-apple', 'trial'),
  ('tofu-scramble', 'trial'),
  ('toast-tuna-avocado', 'trial'),
  ('cutlets-cod-cauliflower', 'trial'),
  ('bean-meatballs', 'trial'),
  ('pasta-tuna-yogurt', 'trial'),
  ('stewed-chickpeas-tomato', 'trial'),
  ('cabbage-rice-lentils-salmon', 'trial'),
  ('carrot-pancakes', 'trial'),
  ('salad-warm-eggplant-vegetables', 'trial'),
  ('salad-kohlrabi-cucumber-yogurt', 'trial'),
  ('sun-dried-tomato-cashew-sauce', 'trial'),
  ('red-bean-spread', 'trial'),
  ('side-potato-rustic', 'trial'),
  ('side-brown-rice', 'trial'),
  ('salmon-ukha', 'trial'),
  ('red-lentil-vegetable-soup', 'trial'),
  ('lentil-crackers', 'trial');

DO $guard$
DECLARE
  recipe_count INTEGER;
  free_count INTEGER;
  trial_count INTEGER;
BEGIN
  SELECT count(*) INTO recipe_count FROM recipes;
  SELECT count(*) FILTER (WHERE access_level = 'free'),
         count(*) FILTER (WHERE access_level = 'trial')
    INTO free_count, trial_count
    FROM recipe_access_targets;

  IF recipe_count <> 88 OR free_count <> 12 OR trial_count <> 18 THEN
    RAISE EXCEPTION
      'Unexpected recipe set: recipes=%, targets free=%/trial=% (expected 88/12/18)',
      recipe_count, free_count, trial_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM recipe_access_targets t
    LEFT JOIN recipes r ON r.id = t.id
    WHERE r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A requested recipe id is absent from recipes';
  END IF;
END $guard$;

UPDATE recipes r
SET access_level = COALESCE(t.access_level, 'pro'),
    is_free = (COALESCE(t.access_level, 'pro') = 'free')
FROM recipe_access_targets t
WHERE r.id = t.id;

UPDATE recipes r
SET access_level = 'pro',
    is_free = false
WHERE NOT EXISTS (
  SELECT 1 FROM recipe_access_targets t WHERE t.id = r.id
);

DO $guard$
DECLARE
  recipe_count INTEGER;
  free_count INTEGER;
  trial_count INTEGER;
  pro_count INTEGER;
  mirror_mismatch_count INTEGER;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE access_level = 'free'),
         count(*) FILTER (WHERE access_level = 'trial'),
         count(*) FILTER (WHERE access_level = 'pro'),
         count(*) FILTER (WHERE is_free IS DISTINCT FROM (access_level = 'free'))
    INTO recipe_count, free_count, trial_count, pro_count, mirror_mismatch_count
    FROM recipes;

  IF recipe_count <> 88 OR free_count <> 12 OR trial_count <> 18 OR pro_count <> 58
     OR mirror_mismatch_count <> 0 THEN
    RAISE EXCEPTION
      'Unexpected final access distribution: all=% free=% trial=% pro=% mirror_mismatches=%',
      recipe_count, free_count, trial_count, pro_count, mirror_mismatch_count;
  END IF;
END $guard$;

COMMIT;

SELECT access_level, count(*)
FROM recipes
GROUP BY access_level
ORDER BY access_level;
