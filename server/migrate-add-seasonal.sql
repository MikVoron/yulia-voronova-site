-- Сезонный рецепт: ровно один признанный «Сезонный» на витрине.
-- Уникальный partial-индекс гарантирует, что одновременно is_seasonal=true может быть только у одного рецепта.
-- Сама раздача атомарна через транзакцию в /admin/recipes/:id/seasonal.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_seasonal BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS recipes_only_one_seasonal ON recipes ((TRUE)) WHERE is_seasonal = TRUE;
