-- Normalize the canonical plant-based recipe tag.
-- UI button label remains "Растительные"; stored tags use only "растительное".
-- Apply:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-normalize-plant-tag-2026-05-25.sql

BEGIN;

UPDATE recipes
SET tags = array_replace(tags, 'растительный', 'растительное'),
    updated_at = now()
WHERE tags @> ARRAY['растительный'];

COMMIT;

SELECT id, name, tags
FROM recipes
WHERE tags @> ARRAY['растительный']
   OR tags @> ARRAY['растительное']
ORDER BY id;
