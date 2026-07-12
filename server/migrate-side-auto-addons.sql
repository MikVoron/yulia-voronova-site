-- Auto-addons for side dishes.
-- Sides should suggest salads as fiber and cutlets as protein.
--
-- Apply on VPS:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-side-auto-addons.sql

ALTER TABLE categories ADD COLUMN IF NOT EXISTS auto_addons JSONB DEFAULT '{}'::jsonb;

UPDATE categories
SET auto_addons = jsonb_strip_nulls(
      COALESCE(auto_addons, '{}'::jsonb)
      || '{"protein": {"fromCategory": "cutlets"}, "fiber": {"fromCategory": "salads"}}'::jsonb
    )
WHERE id = 'sides';

SELECT id, auto_addons
FROM categories
WHERE id = 'sides';
