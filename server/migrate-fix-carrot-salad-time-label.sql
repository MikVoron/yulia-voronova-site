-- Рецепт: Салат с морковью, огурцом и красным перцем
-- Исправление времени приготовления по подтверждённому списку пользователя:
-- time_min = нижняя граница диапазона, time_label = отображаемый диапазон.
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-fix-carrot-salad-time-label.sql

UPDATE recipes
SET
  time_min = 10,
  time_label = '10–15 минут',
  updated_at = now()
WHERE id = 'carrot-cucumber-pepper-salad';
