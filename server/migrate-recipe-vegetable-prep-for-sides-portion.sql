-- One portion is one 125 ml cube. No measured weight was supplied.
BEGIN;

DO $portion$
BEGIN
  UPDATE recipes
  SET portion_grams = NULL, updated_at = now()
  WHERE id = 'vegetable-prep-for-sides'
    AND name = 'Овощная заготовка для гарниров'
    AND servings = 6
    AND (portion_grams = 300 OR portion_grams IS NULL);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unexpected vegetable prep portion metadata';
  END IF;
END $portion$;

COMMIT;
