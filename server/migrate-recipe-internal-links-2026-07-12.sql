-- Internal links between recipe cards. Links are stored directly in the
-- ingredient label and rendered by platform/recipe.html via linkify().
--
-- The WHERE clauses make every update safe to re-run and guard the expected
-- ingredient position/content before changing it.

BEGIN;

UPDATE recipes
SET ingredients = jsonb_set(
  ingredients, '{1,name}',
  '"[Паштет из красной фасоли](red-bean-spread): 50 г"'::jsonb, false
), updated_at = now()
WHERE id = 'toast-red-bean-spread'
  AND ingredients -> 1 ->> 'name' = 'Паштет из красной фасоли: 50 г';

UPDATE recipes
SET ingredients = jsonb_set(
  ingredients, '{11,name}',
  '"[Овощной концентрат](veggie-concentrate): 5 ч. л."'::jsonb, false
), updated_at = now()
WHERE id = 'buckwheat-quinoa-soup'
  AND ingredients -> 11 ->> 'name' = 'Овощной концентрат: 5 ч. л.';

UPDATE recipes
SET ingredients = jsonb_set(
  ingredients, '{7,name}',
  '"[Овощной концентрат](veggie-concentrate): 2 ч. л."'::jsonb, false
), updated_at = now()
WHERE id = 'grechotto'
  AND ingredients -> 7 ->> 'name' = 'Овощной концентрат: 2 ч. л.';

UPDATE recipes
SET ingredients = jsonb_set(
  ingredients, '{14,name}',
  '"[Овощной концентрат](veggie-concentrate): 5 ч. л."'::jsonb, false
), updated_at = now()
WHERE id = 'green-lentil-millet-soup'
  AND ingredients -> 14 ->> 'name' = 'Овощной концентрат: 5 ч. л.';

UPDATE recipes
SET ingredients = jsonb_set(
  ingredients, '{11,name}',
  '"[Овощной концентрат](veggie-concentrate): 1 ч. л."'::jsonb, false
), updated_at = now()
WHERE id = 'lentil-mushroom-pilaf'
  AND ingredients -> 11 ->> 'name' = 'Овощной концентрат: 1 ч. л.';

UPDATE recipes
SET ingredients = jsonb_set(
  ingredients, '{13,name}',
  '"[Овощной концентрат](veggie-concentrate): 4 ч. л."'::jsonb, false
), updated_at = now()
WHERE id = 'shchi-white-beans'
  AND ingredients -> 13 ->> 'name' = 'Овощной концентрат: 4 ч. л.';

UPDATE recipes
SET ingredients = jsonb_set(
  ingredients, '{3,name}',
  '"[Овощной концентрат](veggie-concentrate): 1 ч.л."'::jsonb, false
), updated_at = now()
WHERE id = 'side-brown-rice'
  AND ingredients -> 3 ->> 'name' = 'Овощной концентрат: 1 ч.л.';

UPDATE recipes
SET ingredients = jsonb_set(
  ingredients, '{5,name}',
  '"[Овощной концентрат](veggie-concentrate): 1 ч. л."'::jsonb, false
), updated_at = now()
WHERE id = 'side-potato-celery-puree'
  AND ingredients -> 5 ->> 'name' = 'Овощной концентрат: 1 ч. л.';

COMMIT;

-- Verification:
SELECT r.id, e.value ->> 'name' AS ingredient
FROM recipes r
CROSS JOIN LATERAL jsonb_array_elements(r.ingredients) WITH ORDINALITY e(value, ordinality)
WHERE (r.id = 'toast-red-bean-spread' AND e.ordinality = 2)
   OR (r.id = 'buckwheat-quinoa-soup' AND e.ordinality = 12)
   OR (r.id = 'grechotto' AND e.ordinality = 8)
   OR (r.id = 'green-lentil-millet-soup' AND e.ordinality = 15)
   OR (r.id = 'lentil-mushroom-pilaf' AND e.ordinality = 12)
   OR (r.id = 'shchi-white-beans' AND e.ordinality = 14)
   OR (r.id = 'side-brown-rice' AND e.ordinality = 4)
   OR (r.id = 'side-potato-celery-puree' AND e.ordinality = 6)
ORDER BY r.id;
