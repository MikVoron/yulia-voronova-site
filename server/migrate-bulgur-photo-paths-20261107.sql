-- Exact separator-only repair approved after the public sitemap audit.
-- Preserve recipe text, publication, access and every other JSON field.
BEGIN;
DO $repair$
DECLARE before_row jsonb; after_row jsonb;
BEGIN
  SELECT to_jsonb(r) INTO before_row FROM recipes r WHERE id='side-bulgur' FOR UPDATE;
  IF before_row IS NULL OR before_row->>'name' <> 'Булгур' THEN
    RAISE EXCEPTION 'Expected recipe side-bulgur / Булгур';
  END IF;
  IF before_row->>'photo' IS NULL OR before_row->>'photo' NOT IN (
       'images/recipes/side-bulgur' || chr(92) || 'side-bulgur-cover.webp',
       'images/recipes/side-bulgur/side-bulgur-cover.webp')
     OR before_row #>> '{steps,1,photo}' NOT IN (
       'images/recipes/side-bulgur' || chr(92) || 'side-bulgur-2.webp',
       'images/recipes/side-bulgur/side-bulgur-2.webp')
     OR before_row #>> '{steps,1,photo}' IS NULL THEN
    RAISE EXCEPTION 'Photo fields changed; refusing to overwrite later edits';
  END IF;
  IF before_row->>'photo' = 'images/recipes/side-bulgur/side-bulgur-cover.webp'
     AND before_row #>> '{steps,1,photo}' = 'images/recipes/side-bulgur/side-bulgur-2.webp' THEN
    RETURN;
  END IF;
  UPDATE recipes SET
    photo='images/recipes/side-bulgur/side-bulgur-cover.webp',
    steps=jsonb_set(steps, '{1,photo}', '"images/recipes/side-bulgur/side-bulgur-2.webp"'::jsonb),
    updated_at=now()
  WHERE id='side-bulgur';
  SELECT to_jsonb(r) INTO after_row FROM recipes r WHERE id='side-bulgur';
  IF after_row - ARRAY['photo','steps','updated_at'] IS DISTINCT FROM before_row - ARRAY['photo','steps','updated_at']
     OR (after_row->'steps') #- '{1,photo}' IS DISTINCT FROM (before_row->'steps') #- '{1,photo}' THEN
    RAISE EXCEPTION 'Unexpected change outside the two photo fields';
  END IF;
END $repair$;
COMMIT;
