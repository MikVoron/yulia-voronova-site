-- 003: Video columns for recipes
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS yt_video TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS dzen_video TEXT;
