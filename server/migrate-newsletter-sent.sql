-- Добавить колонку для дедупликации рассылки
ALTER TABLE news ADD COLUMN IF NOT EXISTS newsletter_sent BOOLEAN DEFAULT false;
