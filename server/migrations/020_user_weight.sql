-- 020: Persist the user's weight in the account instead of one browser only.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(4,1);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_weight_kg_range;

ALTER TABLE users
  ADD CONSTRAINT users_weight_kg_range
  CHECK (weight_kg IS NULL OR (weight_kg >= 30 AND weight_kg <= 300));
