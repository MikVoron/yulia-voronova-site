-- 015: Dietary preferences and verified recipe metadata.
--
-- Existing users keep empty preferences. Existing recipes remain unverified,
-- so this migration does not change the current recipe catalog by itself.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dietary_preferences JSONB NOT NULL
  DEFAULT '{"excluded_flags":[],"allow_swaps":true}'::jsonb;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS dietary_flags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_verified BOOLEAN NOT NULL DEFAULT FALSE;

