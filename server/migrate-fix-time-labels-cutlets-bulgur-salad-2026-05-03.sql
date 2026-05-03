-- Fix confirmed recipe time labels and celeriac salad yogurt replacement.
-- Apply on VPS:
--   scp server/migrate-fix-time-labels-cutlets-bulgur-salad-2026-05-03.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-fix-time-labels-cutlets-bulgur-salad-2026-05-03.sql"

SET client_encoding = 'UTF8';

BEGIN;

UPDATE recipes
SET
  time_min = 40,
  time_label = '40–50 минут',
  updated_at = now()
WHERE id = 'chickpea-sweet-potato-cutlets';

UPDATE recipes
SET
  time_label = '20 минут',
  tags = ARRAY['растительное', 'без сои'],
  updated_at = now()
WHERE id = 'side-bulgur';

UPDATE recipes
SET
  time_label = '10 минут',
  tags = ARRAY['без глютена', 'без сои'],
  ingredients = jsonb_set(ingredients, '{3,swap}', 'null'::jsonb, false),
  updated_at = now()
WHERE id = 'celeriac-apple-salad';

UPDATE recipes
SET
  time_label = '40 минут',
  updated_at = now()
WHERE id = 'salmon-ukha';

UPDATE recipes
SET
  time_label = '40 минут',
  updated_at = now()
WHERE id = 'red-lentil-cutlets';

COMMIT;
