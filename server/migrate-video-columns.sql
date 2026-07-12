-- Миграция: добавить колонки yt_video и dzen_video в recipes
-- Запускать на VPS: psql -U plate_user -d plate_db -f migrate-video-columns.sql

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS yt_video TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS dzen_video TEXT;
