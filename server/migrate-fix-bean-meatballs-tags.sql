-- Прод-фикс: добавить тег «бобовые» рецепту «Тефтели из фасоли» (bean-meatballs).
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-fix-bean-meatballs-tags.sql
--
-- Контекст: тег «бобовые» добавлен в server/migrate-recipe-bean-meatballs.sql, но правка
--   старой миграции сама по себе прод не обновляет (миграции не переприменяются автоматически).
--   Этот UPDATE синхронизирует tags в проде с актуальной миграцией.
-- Гард ROW_COUNT: если карточки нет — RAISE EXCEPTION прерывает транзакцию.

BEGIN;

DO $mig$
DECLARE
  n integer;
BEGIN
  UPDATE recipes
  SET tags = ARRAY['растительное', 'без глютена', 'без яиц', 'без мяса', 'бобовые'],
      updated_at = now()
  WHERE id = 'bean-meatballs';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'bean-meatballs: ожидалось обновление 1 карточки, затронуто %.', n;
  END IF;
END
$mig$;

COMMIT;

-- Проверка
SELECT id, name, tags FROM recipes WHERE id = 'bean-meatballs';
