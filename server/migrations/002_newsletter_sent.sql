-- 002: Newsletter dedup column
ALTER TABLE news ADD COLUMN IF NOT EXISTS newsletter_sent BOOLEAN DEFAULT false;
