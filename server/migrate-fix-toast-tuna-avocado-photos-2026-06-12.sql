-- Restore photo bindings for toast-tuna-avocado.
-- Apply:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-fix-toast-tuna-avocado-photos-2026-06-12.sql
--
-- This is intentionally surgical: preserve recipe text, ingredients, nutrition,
-- sort order, access flags, and any unrelated columns.

BEGIN;

DO $$
DECLARE
  n integer;
BEGIN
  UPDATE recipes
  SET
    steps = jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'text', CASE WHEN jsonb_typeof(steps->0) = 'object' THEN steps->0->>'text' ELSE steps->>0 END,
        'photo', 'images/recipes/toast-tuna-avocado/toast-tuna-avocado-1.webp'
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'text', CASE WHEN jsonb_typeof(steps->1) = 'object' THEN steps->1->>'text' ELSE steps->>1 END
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'text', CASE WHEN jsonb_typeof(steps->2) = 'object' THEN steps->2->>'text' ELSE steps->>2 END,
        'photo', 'images/recipes/toast-tuna-avocado/toast-tuna-avocado-3.webp'
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'text', CASE WHEN jsonb_typeof(steps->3) = 'object' THEN steps->3->>'text' ELSE steps->>3 END,
        'photo', 'images/recipes/toast-tuna-avocado/toast-tuna-avocado-4.webp'
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'text', CASE WHEN jsonb_typeof(steps->4) = 'object' THEN steps->4->>'text' ELSE steps->>4 END,
        'photo', 'images/recipes/toast-tuna-avocado/toast-tuna-avocado-5.webp'
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'text', CASE WHEN jsonb_typeof(steps->5) = 'object' THEN steps->5->>'text' ELSE steps->>5 END
      ))
    ),
    photo = 'images/recipes/toast-tuna-avocado/toast-tuna-avocado-cover.webp',
    is_published = true,
    updated_at = now()
  WHERE id = 'toast-tuna-avocado';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected to update 1 toast-tuna-avocado row, updated %', n;
  END IF;
END $$;

COMMIT;

SELECT
  id,
  photo,
  jsonb_path_query_array(steps, '$[*].photo') AS step_photos
FROM recipes
WHERE id = 'toast-tuna-avocado';
