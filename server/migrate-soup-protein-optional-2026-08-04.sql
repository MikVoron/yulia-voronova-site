-- Protein add-ons for soups remain available, but no longer block adding the dish to a plate.
-- The existing protein rule is preserved if one is configured later.
--
-- Apply on VPS:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-soup-protein-optional-2026-08-04.sql
--
-- Idempotent: running it repeatedly keeps all current soup add-on settings.

UPDATE categories
SET auto_addons = jsonb_set(
  COALESCE(auto_addons, '{}'::jsonb),
  '{protein}',
  COALESCE(auto_addons->'protein', '{}'::jsonb) || '{"optional": true}'::jsonb,
  true
)
WHERE id = 'soups';

SELECT id, auto_addons->'protein' AS soup_protein_rule
FROM categories
WHERE id = 'soups';
