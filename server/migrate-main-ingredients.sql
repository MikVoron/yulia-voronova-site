-- ─────────────────────────────────────────────────────────────────────────
-- migrate-main-ingredients.sql
--
-- Добавляет recipes.main_ingredients — кураторский список id ингредиентов
-- для НАВИГАЦИОННЫХ выборок (ingredient.html), НЕ полный состав рецепта.
--
-- Тип: TEXT[] (по образцу recipes.tags). id ингредиентов — стабильные
-- машинные ключи из справочника platform/ingredients.js (carrot, beetroot,
-- white-beans и т.д.), не зависят от русского названия.
--
-- Применять вручную:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-main-ingredients.sql
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS main_ingredients TEXT[] NOT NULL DEFAULT '{}';

-- Seed разметки (id рецептов сверены с прод-БД, ингредиенты — кураторский
-- список от Юлии). Идемпотентно: повторный запуск перезапишет теми же
-- значениями. WHERE id гарантирует no-op для несуществующих рецептов.
-- Список будет пополняться; рецепты вне списка остаются с '{}' (не показываются
-- в выборках) — это норма.
UPDATE recipes SET main_ingredients = ARRAY['carrot']                              WHERE id = 'carrot-cucumber-pepper-salad';
UPDATE recipes SET main_ingredients = ARRAY['beetroot','white-beans']              WHERE id = 'beetroot-bean-arugula';
UPDATE recipes SET main_ingredients = ARRAY['kohlrabi']                            WHERE id = 'salad-kohlrabi-cucumber-yogurt';
UPDATE recipes SET main_ingredients = ARRAY['green-lentils','millet']              WHERE id = 'green-lentil-millet-soup';
UPDATE recipes SET main_ingredients = ARRAY['red-beans','beetroot','cabbage']      WHERE id = 'borscht-red-beans';
UPDATE recipes SET main_ingredients = ARRAY['red-lentils','mushrooms']             WHERE id = 'red-lentil-mushroom-soup';
UPDATE recipes SET main_ingredients = ARRAY['buckwheat','quinoa','mushrooms']      WHERE id = 'buckwheat-quinoa-soup';
UPDATE recipes SET main_ingredients = ARRAY['cabbage','white-beans']               WHERE id = 'shchi-white-beans';
UPDATE recipes SET main_ingredients = ARRAY['rice','mushrooms','red-lentils']      WHERE id = 'lentil-mushroom-pilaf';
UPDATE recipes SET main_ingredients = ARRAY['buckwheat','white-beans','mushrooms'] WHERE id = 'grechotto';
UPDATE recipes SET main_ingredients = ARRAY['tuna','pasta','zucchini']             WHERE id = 'pasta-tuna-yogurt';
UPDATE recipes SET main_ingredients = ARRAY['chickpeas','mushrooms']               WHERE id = 'cutlets-chickpea-mushroom-dill';
UPDATE recipes SET main_ingredients = ARRAY['cabbage','green-lentils','salmon']    WHERE id = 'cabbage-rice-lentils-salmon';
UPDATE recipes SET main_ingredients = ARRAY['chickpeas','zucchini']                WHERE id = 'chickpea-meatballs';
UPDATE recipes SET main_ingredients = ARRAY['cauliflower','salmon']                WHERE id = 'salmon-cauliflower-cutlets';
UPDATE recipes SET main_ingredients = ARRAY['buckwheat','quinoa']                  WHERE id = 'side-buckwheat-quinoa';
UPDATE recipes SET main_ingredients = ARRAY['rice']                                WHERE id = 'side-brown-rice';
UPDATE recipes SET main_ingredients = ARRAY['pasta']                               WHERE id = 'side-pasta-wholegrain';
UPDATE recipes SET main_ingredients = ARRAY['potato']                              WHERE id = 'side-potato-rustic';
UPDATE recipes SET main_ingredients = ARRAY['millet']                              WHERE id = 'millet-pancakes-apple';
UPDATE recipes SET main_ingredients = ARRAY['chickpeas','beetroot']                WHERE id = 'beetroot-hummus';
UPDATE recipes SET main_ingredients = ARRAY['chickpeas']                           WHERE id = 'hummus';
UPDATE recipes SET main_ingredients = ARRAY['buckwheat']                           WHERE id = 'green-buckwheat-pancakes';
UPDATE recipes SET main_ingredients = ARRAY['red-lentils']                         WHERE id = 'lentil-pancakes-gf';
UPDATE recipes SET main_ingredients = ARRAY['pasta','tomatoes']                    WHERE id = 'pasta-tomato-roasted-peppers';
UPDATE recipes SET main_ingredients = ARRAY['cabbage','salmon']                    WHERE id = 'cabbage-salmon-pie';
UPDATE recipes SET main_ingredients = ARRAY['potato','celery']                     WHERE id = 'side-potato-celery-puree';
UPDATE recipes SET main_ingredients = ARRAY['mung-beans']                          WHERE id = 'mung-bean-soup';
UPDATE recipes SET main_ingredients = ARRAY['red-lentils']                         WHERE id = 'red-lentil-vegetable-soup';
UPDATE recipes SET main_ingredients = ARRAY['white-beans']                         WHERE id = 'bean-meatballs';
UPDATE recipes SET main_ingredients = ARRAY['chickpeas','sweet-potato']            WHERE id = 'chickpea-sweet-potato-cutlets';
UPDATE recipes SET main_ingredients = ARRAY['bulgur']                              WHERE id = 'side-bulgur';
UPDATE recipes SET main_ingredients = ARRAY['celery']                              WHERE id = 'celeriac-apple-salad';
UPDATE recipes SET main_ingredients = ARRAY['salmon']                              WHERE id = 'salmon-ukha';
UPDATE recipes SET main_ingredients = ARRAY['red-lentils']                         WHERE id = 'red-lentil-cutlets';
UPDATE recipes SET main_ingredients = ARRAY['red-lentils','bulgur']                WHERE id = 'soup-red-lentil-bulgur';
UPDATE recipes SET main_ingredients = ARRAY['potato','zucchini']                   WHERE id = 'side-potato-zucchini';
UPDATE recipes SET main_ingredients = ARRAY['chickpeas']                           WHERE id = 'salad-caesar-chickpea-cashew';
UPDATE recipes SET main_ingredients = ARRAY['chickpeas']                           WHERE id = 'chickpea-noodle-soup';
