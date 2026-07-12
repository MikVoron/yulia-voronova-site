-- Миграция: превратить обращения (feedback_messages) в треды/диалоги
-- Выполнить на VPS: sudo -u postgres psql smartplate_db -f /tmp/014_feedback_threads.sql
--
-- Что делает:
--   1) Создаёт feedback_thread_messages с сообщениями диалога (user/admin).
--   2) Расширяет CHECK на feedback_messages.status до новых значений.
--   3) Переносит существующие данные:
--        - feedback_messages.text → первое сообщение user в треде;
--        - feedback_messages.admin_reply (если есть) → сообщение admin в треде.
--      seen_at для admin-сообщения проставляется из старого reply_seen.
--   4) Переводит статусы: new → waiting_admin, answered → waiting_user.
--   5) Создаёт индексы.
--
-- Старые поля text/admin_reply/admin_replied_at/admin_id/reply_seen остаются
-- в таблице как deprecated — для исторической совместимости. Новый API/UI
-- читает диалог из feedback_thread_messages.

BEGIN;

-- 1) Новая таблица треда
CREATE TABLE IF NOT EXISTS feedback_thread_messages (
  id          SERIAL PRIMARY KEY,
  feedback_id INTEGER NOT NULL REFERENCES feedback_messages(id) ON DELETE CASCADE,
  sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'admin')),
  sender_id   UUID,
  text        TEXT NOT NULL,
  seen_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_thread_feedback
  ON feedback_thread_messages (feedback_id, created_at);

-- Под отчёт «непросмотренные ответы Юлии» в кабинете
CREATE INDEX IF NOT EXISTS idx_feedback_thread_unseen_admin
  ON feedback_thread_messages (feedback_id)
  WHERE sender_type = 'admin' AND seen_at IS NULL;

GRANT ALL ON TABLE feedback_thread_messages TO smartplate;
GRANT USAGE, SELECT ON SEQUENCE feedback_thread_messages_id_seq TO smartplate;

-- 2) Расширить набор статусов
ALTER TABLE feedback_messages DROP CONSTRAINT IF EXISTS feedback_messages_status_check;
ALTER TABLE feedback_messages
  ADD CONSTRAINT feedback_messages_status_check
  CHECK (status IN ('new', 'answered', 'waiting_admin', 'waiting_user', 'closed'));

-- 3) Перенос существующих данных (идемпотентно — только если в треде ещё нет сообщений по этому feedback)
--    3a) Первое сообщение пользователя из старого text
INSERT INTO feedback_thread_messages (feedback_id, sender_type, sender_id, text, seen_at, created_at)
SELECT f.id, 'user', f.user_id, f.text, f.created_at, f.created_at
FROM feedback_messages f
WHERE f.text IS NOT NULL
  AND f.text <> ''
  AND NOT EXISTS (
    SELECT 1 FROM feedback_thread_messages m WHERE m.feedback_id = f.id
  );

--    3b) Ответ Юлии из старого admin_reply
--        seen_at = admin_replied_at если reply_seen=true, иначе NULL
INSERT INTO feedback_thread_messages (feedback_id, sender_type, sender_id, text, seen_at, created_at)
SELECT f.id, 'admin', f.admin_id, f.admin_reply,
       CASE WHEN f.reply_seen THEN COALESCE(f.admin_replied_at, now()) ELSE NULL END,
       COALESCE(f.admin_replied_at, f.updated_at, f.created_at)
FROM feedback_messages f
WHERE f.admin_reply IS NOT NULL
  AND f.admin_reply <> ''
  AND NOT EXISTS (
    SELECT 1 FROM feedback_thread_messages m
    WHERE m.feedback_id = f.id AND m.sender_type = 'admin'
  );

-- 4) Маппинг статусов (только для записей, ещё не переведённых)
UPDATE feedback_messages SET status = 'waiting_admin' WHERE status = 'new';
UPDATE feedback_messages SET status = 'waiting_user'  WHERE status = 'answered';

COMMIT;

-- Sanity check (необязательно, только просмотр):
-- SELECT status, COUNT(*) FROM feedback_messages GROUP BY status;
-- SELECT sender_type, COUNT(*) FROM feedback_thread_messages GROUP BY sender_type;
