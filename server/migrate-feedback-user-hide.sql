-- Миграция: soft-delete обращений на стороне пользователя
-- Пользователь скрывает тред у себя в ЛК — в БД запись остаётся для аудита и админки.
-- Выполнить на VPS: sudo -u postgres psql smartplate_db -f migrate-feedback-user-hide.sql

ALTER TABLE feedback_messages
  ADD COLUMN IF NOT EXISTS user_deleted_at TIMESTAMPTZ;

-- Частичный индекс под основной запрос ЛК (фильтр user_deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_feedback_user_visible
  ON feedback_messages (user_id, created_at DESC)
  WHERE user_deleted_at IS NULL;
