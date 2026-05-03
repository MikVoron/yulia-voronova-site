-- Business rule: every recipe with "Плов" in the name gets salads as Fiber add-ons.
-- This keeps existing auto_addons keys and adds/overwrites only the fiber rule.
-- Apply:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-pilaf-auto-fiber-rule.sql

UPDATE recipes
SET
  auto_addons = COALESCE(auto_addons, '{}'::jsonb)
    || '{"fiber": {"fromCategory": "salads"}}'::jsonb,
  updated_at = now()
WHERE name ILIKE '%Плов%';
