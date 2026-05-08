-- Унификация: в аддонах супов поставить fiber=1 у тофу там, где сейчас 0.
-- Все супы (is_soup=true) с тофу 130 г / 91 ккал должны иметь fiber=1
-- (общеизвестное свойство продукта; в большинстве супов уже 1).
--
-- Затронутые рецепты до миграции:
--   buckwheat-quinoa-soup → "Тофу" 130 г, fiber 0
--   mung-bean-soup        → "Тофу" 130 г, fiber 0
--
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-fix-soup-tofu-fiber-2026-05-08.sql

UPDATE recipes
SET add_protein = (
      SELECT jsonb_agg(
        CASE
          WHEN item->>'name' ILIKE '%тофу%' AND (item->>'fiber')::int = 0
            THEN jsonb_set(item, '{fiber}', to_jsonb(1))
          ELSE item
        END
      )
      FROM jsonb_array_elements(add_protein) item
    ),
    updated_at = now()
WHERE is_soup = true
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(add_protein) item
    WHERE item->>'name' ILIKE '%тофу%'
      AND (item->>'fiber')::int = 0
  );

-- Контрольный вывод: все аддоны с тофу в супах
SELECT id, item->>'name' AS addon, item->>'amount' AS amount, item->>'fiber' AS fiber
FROM recipes, jsonb_array_elements(add_protein) item
WHERE is_soup = true
  AND item->>'name' ILIKE '%тофу%'
ORDER BY id;
