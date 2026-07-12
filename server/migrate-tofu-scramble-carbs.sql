-- Рецепт: Скрэмбл из тофу (id: tofu-scramble) — добавка в add_carbs
-- Применить на VPS: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-tofu-scramble-carbs.sql
--
-- Только add_carbs: добавляем цельнозерновой хлеб (1 ломтик, fat 0 — по уточнению заказчика).
-- Остальные поля записи НЕ трогаем.

BEGIN;

-- Гард: обновляем существующую запись. Если tofu-scramble не найден — прерываемся,
-- чтобы UPDATE не прошёл молча при 0 обновлённых строк.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM recipes WHERE id = 'tofu-scramble') THEN
    RAISE EXCEPTION 'Рецепт tofu-scramble не найден — UPDATE отменён.';
  END IF;
END $$;

UPDATE recipes SET
  add_carbs = '[
    {"name": "Цельнозерновой хлеб", "amount": "1 ломтик", "kcal": 70, "protein": 3, "fat": 0, "carbs": 15, "fiber": 3}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'tofu-scramble';

COMMIT;
