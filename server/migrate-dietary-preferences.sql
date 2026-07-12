-- Dietary preferences and verified recipe metadata.
-- Safe to run repeatedly. No existing recipe is filtered until it is verified.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dietary_preferences JSONB NOT NULL
  DEFAULT '{"excluded_flags":[],"allow_swaps":true}'::jsonb;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS dietary_flags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_verified BOOLEAN NOT NULL DEFAULT FALSE;
