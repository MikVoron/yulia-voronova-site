-- Keep the protein add-on for Grechotto available, but do not require it to
-- add the dish to a plate. Required groups are displayed before this optional
-- protein group by platform/recipe-page.js.
--
-- Apply on VPS:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-grechotto-protein-optional-2026-08-11.sql
--
-- Idempotent: retains the existing fiber auto-add-on configuration.

UPDATE recipes
SET auto_addons = jsonb_set(
  COALESCE(auto_addons, '{}'::jsonb),
  '{protein}',
  COALESCE(auto_addons->'protein', '{}'::jsonb) || '{"optional": true}'::jsonb,
  true
),
updated_at = now()
WHERE id = 'grechotto';

SELECT id, auto_addons
FROM recipes
WHERE id = 'grechotto';
