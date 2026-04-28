-- Рецепт: Тефтели из нута с овощами (chickpea-meatballs)
-- Подключаем cover + шаговые фото из images/recipes/chickpea-meatballs/.
-- Только UPDATE — рецепт уже есть в БД.
--
-- Конвенция (см. server/migrate-recipe-photos-convention.sql):
--   • r.photo указывает на -final.webp. Фронт platform/recipe.html
--     автоматически выводит -start.webp после ингредиентов и -final.webp
--     как «Приятного аппетита» в самом конце.
--   • В steps[].photo НЕ должно быть -start и -final.
--   • Маппинг -N.webp → step N (1-индексация):
--       шаг 3 → -3.webp (резать лук/морковь/чеснок)
--       шаг 4 → -4.webp (измельчить в комбайне)
--       шаг 5 → -5.webp (обжарить лук)
--       шаг 7 → -7.webp (смешать нут с овощами)
--       шаг 9 → [-9.1.webp, -9.2.webp] (вмешать муку — мультифото)
--       шаг 10 → -10.webp (сформировать тефтельки)
--   • Шаги 1, 2, 6, 8, 11 фото не получают: реальных кадров нет.
--
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-recipe-chickpea-meatballs-photos.sql

BEGIN;

UPDATE recipes
SET
  photo = 'images/recipes/chickpea-meatballs/chickpea-meatballs-final.webp',
  steps = '[
    {"text": "Натрите кабачок и очень хорошо отожмите.", "photo": null},
    {"text": "Разморозьте кукурузу и горошек, слейте воду.", "photo": null},
    {"text": "Порежьте лук, морковь и чеснок достаточно крупно.", "photo": "images/recipes/chickpea-meatballs/chickpea-meatballs-3.webp"},
    {"text": "Измельчите овощи в комбайне.", "photo": "images/recipes/chickpea-meatballs/chickpea-meatballs-4.webp"},
    {"text": "Обжарьте лук, морковь и чеснок 10 минут до мягкости.", "photo": "images/recipes/chickpea-meatballs/chickpea-meatballs-5.webp"},
    {"text": "Добавьте специи и перемешайте.", "photo": null},
    {"text": "Смешайте нут с овощами, немного измельчите в комбайне.", "photo": "images/recipes/chickpea-meatballs/chickpea-meatballs-7.webp"},
    {"text": "Добавьте кукурузу, горошек, соевый соус и соль.", "photo": null},
    {"text": "Вмешайте муку и доведите массу до консистенции, когда она мягкая, но лепится.", "photo": ["images/recipes/chickpea-meatballs/chickpea-meatballs-9.1.webp", "images/recipes/chickpea-meatballs/chickpea-meatballs-9.2.webp"]},
    {"text": "Сформируйте 20–25 тефтелек.", "photo": "images/recipes/chickpea-meatballs/chickpea-meatballs-10.webp"},
    {"text": "Разогрейте духовку до 200°C и запекайте 20–25 минут, при желании переверните.", "photo": null}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'chickpea-meatballs';

COMMIT;
