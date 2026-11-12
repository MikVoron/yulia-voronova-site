-- Apply before deploying the API that reads and writes news.title.
-- Existing news keeps its original text; no automatic content edits.
ALTER TABLE news ADD COLUMN IF NOT EXISTS title VARCHAR(200);
