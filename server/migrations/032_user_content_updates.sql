-- Per-user read state for published platform updates.
-- Source of updates: existing published news rows, including recipe announcements.

CREATE TABLE IF NOT EXISTS user_content_updates_seen (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, news_id)
);

CREATE INDEX IF NOT EXISTS idx_user_content_updates_seen_user
  ON user_content_updates_seen (user_id, seen_at DESC);

-- Repair the just-sent pasta notice into a recipe announcement without sending
-- another email. Updating this row does not run the newsletter sender.
WITH current_pasta_notice AS (
  SELECT id
  FROM news
  WHERE is_published = true
    AND type = 'news'
    AND recipe_id IS NULL
    AND text LIKE 'Новый рецепт %Цельнозерновая паста, кремовый грибной соус и копчёный тофу%'
  ORDER BY created_at DESC
  LIMIT 1
)
UPDATE news
SET type = 'recipe',
    recipe_id = 'pasta-mushrooms-smoked-tofu',
    text = 'Цельнозерновая паста, кремовый грибной соус и копчёный тофу — сытный горячий ужин, который готовится за 30 минут.',
    badge = 'Новый рецепт',
    label = NULL,
    created_at = now()
WHERE id IN (SELECT id FROM current_pasta_notice);

-- Existing users start without an archive of old notifications. The current
-- pasta announcement stays unread so it is the first visible update.
INSERT INTO user_content_updates_seen (user_id, news_id, seen_at)
SELECT u.id, n.id, now()
FROM users u
CROSS JOIN news n
WHERE n.is_published = true
  AND NOT (n.type = 'recipe' AND n.recipe_id = 'pasta-mushrooms-smoked-tofu')
ON CONFLICT (user_id, news_id) DO NOTHING;

GRANT ALL ON TABLE user_content_updates_seen TO smartplate;
