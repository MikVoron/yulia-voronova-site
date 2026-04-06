-- Миграция: добавить reply_seen для бейджа новых ответов
-- Выполнить на VPS: sudo -u postgres psql smartplate_db -f migrate-feedback-seen.sql

ALTER TABLE feedback_messages ADD COLUMN IF NOT EXISTS reply_seen BOOLEAN NOT NULL DEFAULT false;
