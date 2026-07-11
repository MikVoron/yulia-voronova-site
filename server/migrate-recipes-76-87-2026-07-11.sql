-- Recipes 76-87 from the author text and clarifications confirmed 2026-07-11.
-- All records are unpublished drafts; photos and emoji are deliberately deferred.
-- The vegetable broths intentionally have no portions, serving weight or nutrition.
-- Apply:
--   scp server/migrate-recipes-76-87-2026-07-11.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipes-76-87-2026-07-11.sql"

BEGIN;

INSERT INTO ingredient_catalog (id, name, group_id, sort_order) VALUES
  ('oats', 'Овсянка', 'grains', 1000),
  ('seabass', 'Сибас', 'fish', 1000)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  group_id = EXCLUDED.group_id,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO recipes (
  id, cat, name, emoji, time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note, ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber, portion_grams, is_published,
  sort_order, auto_addons, is_soup, main_ingredients, dietary_flags, dietary_verified
) VALUES
(
  'stewed-chickpeas-tomato', 'mains', 'Тушёный нут в томатном соусе', NULL, 40, NULL, 'easy', 4, false,
  119, 10, 2, 19, 5, ARRAY['растительное', 'без глютена', 'без сои', 'бобовые'], NULL,
  'Нут получается очень мягким и нежным, а томатный соус делает блюдо особенно сочным и ароматным. Подавайте с любимой крупой, а для более яркого вкуса можно добавить острый перец чили.', NULL,
  '[
    {"name":"Нут варёный: 400 г","swap":"Консервированный нут"},
    {"name":"Лук репчатый: 1 крупный","swap":null}, {"name":"Морковь: 1 крупная","swap":null},
    {"name":"Чеснок: 3 зубчика","swap":null}, {"name":"Томатная паста: 1,5 ст. л.","swap":null},
    {"name":"Вода: 350 мл","swap":null}, {"name":"Копчёная паприка: 1 ч. л.","swap":null},
    {"name":"Молотый кориандр: 1 ч. л.","swap":null}, {"name":"Соль: 1/2 ч. л.","swap":null},
    {"name":"Яблочный уксус: 2 ч. л.","swap":null}, {"name":"Растительное масло: 1 ч. л.","swap":null}
  ]'::jsonb,
  '[
    {"text":"Нарежьте лук на мелкие кубики, морковь натрите на мелкой тёрке, чеснок мелко порубите."},
    {"text":"Разогрейте масло и обжарьте лук с морковью 6–7 минут, до мягкости."},
    {"text":"Добавьте копчёную паприку и кориандр, перемешайте и прогрейте 30 секунд."},
    {"text":"Вмешайте томатную пасту и обжаривайте ещё около 1 минуты."},
    {"text":"Добавьте варёный нут и хорошо перемешайте его с овощами и соусом."},
    {"text":"Влейте воду, добавьте соль, накройте крышкой и тушите на небольшом огне 15–20 минут."},
    {"text":"Примерно 1/3 нута вместе с небольшим количеством овощей и соуса измельчите блендером до кремовой массы, затем верните обратно в кастрюлю и перемешайте. При необходимости добавьте немного воды."},
    {"text":"Добавьте яблочный уксус и чеснок, потушите ещё около 1 минуты."},
    {"text":"При желании добавьте немного острого перца чили."}
  ]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 230, false, 0, '{}'::jsonb, false,
  ARRAY['chickpeas', 'carrot'], ARRAY[]::text[], true
),
(
  'red-bean-spread', 'spreads', 'Паштет из красной фасоли', NULL, 25, NULL, 'easy', 10, false,
  67, 6, 1, 9, 3, ARRAY['растительное', 'без глютена', 'без сои', 'бобовые'], NULL,
  'Паштет получается нежным, мягким и в меру сладким, с лёгкими пряными нотами тимьяна и кориандра. Хорошо намазывается на хлеб и подходит для завтрака или перекуса.', NULL,
  '[
    {"name":"Красная фасоль варёная: 500 г","swap":"Консервированная красная фасоль"},
    {"name":"Лук: 150 г","swap":null}, {"name":"Морковь: 150 г","swap":null}, {"name":"Чеснок: 1 зубчик","swap":null},
    {"name":"Тимьян: 1/2 ч. л.","swap":null}, {"name":"Молотый кориандр: 1/2 ч. л.","swap":null},
    {"name":"Соль — по вкусу, начать с 1 ч. л.","swap":null}, {"name":"Растительное масло: 1 ч. л.","swap":null}
  ]'::jsonb,
  '[
    {"text":"Лук нарежьте на небольшие кубики, морковь натрите на крупной тёрке."},
    {"text":"Разогрейте масло и обжарьте овощи 3–4 минуты до мягкости."},
    {"text":"Добавьте тимьян и кориандр, перемешайте и прогрейте 20–30 секунд."},
    {"text":"Накройте крышкой и потушите ещё около 7 минут на слабом огне."},
    {"text":"Поместите в блендер или в мясорубку фасоль, овощи, чеснок и соль."},
    {"text":"Измельчите до однородной массы."}, {"text":"Попробуйте паштет на соль, при необходимости добавьте ещё немного."}
  ]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 50, false, 0, '{}'::jsonb, false,
  ARRAY['red-beans', 'carrot'], ARRAY[]::text[], true
),
(
  'toast-red-bean-spread', 'breakfasts', 'Тост с паштетом из красной фасоли', NULL, 5, NULL, 'easy', 1, false,
  110, 6, 1, 19, 5, ARRAY['растительное', 'без сои', 'бобовые'], NULL,
  'Разнообразьте свой завтрак новыми бутербродами — приготовьте паштет из красной фасоли. У него нежный, мягкий и сладкий вкус, который нравится даже тем, кто не любит бобовые.', NULL,
  '[
    {"name":"Цельнозерновой хлеб: 25 г","swap":null,"dietary_flags":["gluten"]},
    {"name":"Паштет из красной фасоли: 50 г","swap":null}, {"name":"Зелень — по желанию","swap":null},
    {"name":"Острый перец — по желанию","swap":null}
  ]'::jsonb,
  '[{"text":"Намажьте на хлеб паштет из красной фасоли, украсьте сверху любимой зеленью и посыпьте острым перцем при желании."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 75, false, 0, '{}'::jsonb, false,
  ARRAY['red-beans', 'carrot'], ARRAY['gluten'], true
),
(
  'seabass-capers-pepper-salsa', 'mains', 'Сибас с сальсой из каперсов и сладкого перца', NULL, 25, NULL, 'easy', 2, false,
  104, 15, 4, 2, 2, ARRAY['рыбное', 'без сои'], NULL,
  'Нежный сибас в сочетании с тёплой сальсой из сладкого перца и каперсов получается ярким, свежим и очень ароматным. Подавайте сразу, пока рыба и сальса ещё тёплые.', NULL,
  '[
    {"name":"Сибас, половина: 280 г","swap":null,"dietary_flags":["fish"]}, {"name":"Соль — щепотка","swap":null},
    {"name":"Красный сладкий перец: 1 шт.","swap":null}, {"name":"Красный лук: 1 средний","swap":null},
    {"name":"Чеснок: 1 зубчик","swap":null}, {"name":"Каперсы: 2 ст. л.","swap":null},
    {"name":"Сок лимона: 1 ст. л.","swap":null}, {"name":"Кинза: 10 г","swap":null}, {"name":"Оливковое масло: 1 ч. л.","swap":null}
  ]'::jsonb,
  '[
    {"text":"Разогрейте духовку до 180 °C."}, {"text":"Обсушите филе сибаса бумажным полотенцем, посолите с обеих сторон."},
    {"text":"Выложите рыбу на противень, застеленный пергаментом, кожей вниз и запекайте около 15–20 минут."},
    {"text":"Для сальсы мелко нарежьте красный лук, сладкий перец, чеснок и каперсы."},
    {"text":"Разогрейте в сковороде оливковое масло и обжарьте лук с перцем 3–4 минуты, чтобы овощи стали мягче, но сохранили лёгкий хруст."},
    {"text":"Добавьте чеснок и каперсы, готовьте около 30 секунд, постоянно помешивая."},
    {"text":"Снимите с огня, добавьте сок лимона и мелко нарезанную кинзу."}, {"text":"Аккуратно перемешайте и выложите тёплую сальсу на готовую рыбу."}
  ]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 180, false, 0,
  '{"carbs":{"fromCategory":"sides"},"fiber":{"fromCategory":"salads"}}'::jsonb, false, ARRAY['seabass'], ARRAY['fish'], true
),
(
  'light-vegetable-broth', 'bases', 'Бульон овощной светлый', NULL, 30, NULL, 'easy', NULL, false,
  NULL, NULL, NULL, NULL, NULL, ARRAY['растительное', 'без глютена', 'без сои'], NULL,
  'Ароматная домашняя основа для овощных супов, а также супов с бобовыми или мясом.', NULL,
  '[{"name":"Морковь: 200 г","swap":null},{"name":"Лук репчатый: 200 г","swap":null},{"name":"Стебли сельдерея: 200 г","swap":null},{"name":"Вода: 3 л","swap":null}]'::jsonb,
  '[{"text":"Овощи очистите, вымойте и нарежьте кубиком примерно по 5 мм."},{"text":"Влейте 3 литра холодной воды, добавьте овощи и поставьте на огонь."},{"text":"Доведите почти до кипения, уменьшите огонь и томите 20 минут."},{"text":"Процедите бульон."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, false, 0, '{}'::jsonb, false, ARRAY[]::text[], ARRAY[]::text[], true
),
(
  'oatmeal', 'breakfasts', 'Каша овсяная', NULL, 20, NULL, 'easy', 4, false,
  162, 6, 4, 26, 2, ARRAY['растительное', 'без глютена', 'без сои'], NULL,
  'Эту кашу можно сделать сладкой — добавьте немного подсластителя или банан по вкусу. Я обычно варю кашу вечером, а утром остаётся только разогреть её и добавить любимый топпинг.', NULL,
  '[
    {"name":"Овсянка: 150 г","swap":null},
    {"name":"Соевое молоко: 700 г","swap":"Коровье молоко 2,5%; Овсяное молоко","dietary_flags":["soy"],"swap_options":[{"name":"Коровье молоко 2,5%: 175 мл","dietary_flags":["milk"]},{"name":"Овсяное молоко: 175 мл","dietary_flags":[]}],"swap_nutrition":{"original":{"kcal":59,"protein":5,"fat":3,"carbs":3,"fiber":0},"replacement":{"kcal":91,"protein":5,"fat":4,"carbs":8,"fiber":0},"replacements":[{"name":"Коровье молоко 2,5%","nutrition":{"kcal":91,"protein":5,"fat":4,"carbs":8,"fiber":0}},{"name":"Овсяное молоко","nutrition":{"kcal":83,"protein":2,"fat":3,"carbs":12,"fiber":1}}]}},
    {"name":"Соль — щепотка","swap":null}
  ]'::jsonb,
  '[{"text":"Доведите молоко до кипения."},{"text":"Введите овсянку и варите до готовности 10–20 минут, в зависимости от вида хлопьев."},{"text":"Дайте каше постоять перед подачей."}]'::jsonb,
  '[{"name":"Йогурт 2–5%","amount":"150 г","kcal":95,"protein":8,"fat":3,"carbs":11,"fiber":0}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[{"name":"Ягоды","amount":"80 г","kcal":32,"protein":1,"fat":0,"carbs":7,"fiber":3}]'::jsonb,
  215, false, 0, '{}'::jsonb, false, ARRAY['oats'], ARRAY['soy'], true
),
(
  'baked-oatmeal-apples-cinnamon', 'breakfasts', 'Запечённая овсянка с яблоками и корицей', NULL, 30, NULL, 'easy', 4, false,
  205, 5, 4, 38, 8, ARRAY['растительное', 'без глютена', 'без сои'], NULL,
  'Тёплая, ароматная овсянка с яблоками и корицей отлично подходит для уютного завтрака. Её можно приготовить вечером и есть утром даже в холодном виде, а если каша получится суховатой, просто добавьте немного молока. Очень вкусно к такой каше добавить немного йогурта.', NULL,
  '[
    {"name":"Овсянка: 135 г","swap":null}, {"name":"Банан спелый: 120 г","swap":null}, {"name":"Семена чиа: 18 г","swap":null},
    {"name":"Яблоки: 300 г","swap":null}, {"name":"Овсяное молоко: 360 мл","swap":"Коровье молоко 2,5%; Соевое молоко","swap_options":[{"name":"Коровье молоко 2,5%: 90 мл","dietary_flags":["milk"]},{"name":"Соевое молоко: 90 мл","dietary_flags":["soy"]}],"swap_nutrition":{"original":{"kcal":42,"protein":1,"fat":2,"carbs":6,"fiber":1},"replacement":{"kcal":47,"protein":3,"fat":2,"carbs":4,"fiber":0},"replacements":[{"name":"Коровье молоко 2,5%","nutrition":{"kcal":47,"protein":3,"fat":2,"carbs":4,"fiber":0}},{"name":"Соевое молоко","nutrition":{"kcal":30,"protein":3,"fat":2,"carbs":2,"fiber":0}}]}},
    {"name":"Корица: 1 ч. л.","swap":null}, {"name":"Соль — щепотка","swap":null}
  ]'::jsonb,
  '[{"text":"Разомните банан вилкой, яблоки нарежьте маленькими кубиками."},{"text":"Смажьте небольшую форму для выпечки небольшим количеством растительного масла."},{"text":"Выложите банан и равномерно распределите его по форме."},{"text":"Всыпьте овсянку и семена чиа."},{"text":"Влейте молоко, добавьте соль и слегка перемешайте вилкой."},{"text":"Сверху выложите яблоки, посыпьте корицей и отправьте в духовку на 180 °C на 25 минут."}]'::jsonb,
  '[{"name":"Йогурт 2–5%","amount":"150 г","kcal":95,"protein":8,"fat":3,"carbs":11,"fiber":0}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 225, false, 0, '{}'::jsonb, false, ARRAY['oats'], ARRAY[]::text[], true
),
(
  'roasted-carrot-tomato-sauce', 'sauces', 'Соус из запечённой моркови и томатов', NULL, 40, NULL, 'easy', 5, false,
  65, 1, 3, 9, 2, ARRAY['растительное', 'без сои', 'без глютена'], NULL,
  'Нежный сладковатый соус с ярким вкусом запечённых овощей, ароматом базилика и орегано отлично подходит к пасте, крупам, рыбе или мясу.', NULL,
  '[{"name":"Томаты: 200 г","swap":null},{"name":"Морковь: 3 средние","swap":null},{"name":"Орегано: 1 ч. л.","swap":null},{"name":"Базилик: 10 г","swap":null},{"name":"Вода: 100 г","swap":null},{"name":"Оливковое масло: 1 ст. л.","swap":null},{"name":"Соль — по вкусу","swap":null}]'::jsonb,
  '[{"text":"Томаты нарежьте на небольшие кусочки. Морковь очистите и нарежьте соломкой."},{"text":"Приправьте солью, орегано и оливковым маслом, затем перемешайте."},{"text":"Выложите овощи на противень, застеленный пергаментом."},{"text":"Запекайте при температуре 180 °C 25–30 минут."},{"text":"Переложите все овощи в блендер, добавьте базилик и немного воды."},{"text":"Взбейте до получения кремовой текстуры."},{"text":"Регулируйте густоту по желанию, добавляя больше или меньше воды."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 75, false, 0, '{}'::jsonb, false, ARRAY['carrot', 'tomatoes'], ARRAY[]::text[], true
),
(
  'red-lentil-bread', 'breads', 'Хлеб из красной чечевицы', NULL, 60, NULL, 'medium', 8, false,
  95, 6, 3, 14, 4, ARRAY['растительное', 'без глютена', 'без сои'], NULL,
  'Ароматный безглютеновый хлеб с плотной, но нежной текстурой. Отлично подходит для тостов, сэндвичей и намазок. Если после измельчения тесто получилось слишком густым и плохо перемешивается, добавьте 1–2 ст. л. воды. Обычно это не требуется, если чечевица хорошо напиталась влагой во время замачивания, но разные сорта чечевицы могут впитывать воду по-разному.', NULL,
  '[{"name":"Красная чечевица: 250 г","swap":null},{"name":"Лимонный сок: 1 ст. л.","swap":null},{"name":"Оливковое масло: 1 ст. л.","swap":null},{"name":"Куркума: 1 ч. л.","swap":null},{"name":"Копчёная паприка: 1 ч. л.","swap":null},{"name":"Псиллиум: 10 г","swap":null},{"name":"Разрыхлитель: 4 г","swap":null},{"name":"Рисовая мука: 25 г","swap":null},{"name":"Молотый лён: 15 г","swap":null},{"name":"Соль: 1 ч. л.","swap":null}]'::jsonb,
  '[{"text":"Промойте красную чечевицу и замочите её в холодной воде минимум на 3 часа, можно на ночь."},{"text":"Слейте воду и ещё раз тщательно промойте чечевицу."},{"text":"Переложите чечевицу в чашу блендера и измельчите до максимально однородной массы."},{"text":"Добавьте лимонный сок, оливковое масло, куркуму, копчёную паприку, рисовую муку, молотый лён, соль и разрыхлитель."},{"text":"Хорошо перемешайте до получения густого, однородного теста."},{"text":"Застелите противень пергаментом и сформируйте из теста овальную или круглую буханку высотой около 4 см."},{"text":"Сделайте сверху несколько неглубоких надрезов и, по желанию, посыпьте кунжутом, льном или другими семенами."},{"text":"Выпекайте в заранее разогретой до 180 °C духовке 45–55 минут, проверьте готовность зубочисткой."},{"text":"Достаньте хлеб из духовки и полностью остудите на решётке."},{"text":"После полного остывания хлеб станет плотнее и будет легче нарезаться."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 50, false, 0, '{}'::jsonb, false, ARRAY['red-lentils'], ARRAY[]::text[], true
),
(
  'oat-rice-bread', 'breads', 'Хлеб овсяно-рисовый', NULL, 60, NULL, 'medium', 8, false,
  93, 3, 3, 14, 2, ARRAY['растительное', 'без глютена', 'без сои'], NULL,
  'Мягкий, ароматный и сытный овсяно-рисовый хлеб с нежной текстурой и лёгкой хрустящей корочкой. Овсяную муку легко сделать самим — достаточно просто перемолоть такое же количество овсяных хлопьев в блендере или кофемолке.', NULL,
  '[{"name":"Овсяная мука: 180 г","swap":null},{"name":"Рисовая мука: 40 г","swap":null},{"name":"Псиллиум: 11 г","swap":null},{"name":"Яблочный уксус: 1 ст. л.","swap":null},{"name":"Оливковое масло: 1 ст. л.","swap":null},{"name":"Разрыхлитель: 8 г","swap":null},{"name":"Молотый лён: 20 г","swap":null},{"name":"Соль: 1 ч. л.","swap":null},{"name":"Вода: 260 мл","swap":null}]'::jsonb,
  '[{"text":"Смешайте все сухие ингредиенты."},{"text":"Добавьте оливковое масло, яблочный уксус и воду."},{"text":"Хорошо перемешайте до получения густого, однородного теста."},{"text":"Застелите противень пергаментом и сформируйте из теста овальную или круглую буханку высотой около 4 см."},{"text":"Сделайте сверху несколько неглубоких надрезов и, по желанию, посыпьте кунжутом, тыквенными семечками или другими семенами."},{"text":"Выпекайте в заранее разогретой до 180 °C духовке 45–55 минут, проверьте готовность зубочисткой."},{"text":"Достаньте хлеб из духовки и полностью остудите на решётке."},{"text":"После полного остывания хлеб станет плотнее и будет легче нарезаться."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 46, false, 0, '{}'::jsonb, false, ARRAY['oats'], ARRAY[]::text[], true
),
(
  'dark-vegetable-broth', 'bases', 'Бульон овощной тёмный', NULL, 30, NULL, 'easy', NULL, false,
  NULL, NULL, NULL, NULL, NULL, ARRAY['растительное'], NULL,
  'У этого бульона получается глубокий, необычный и очень насыщенный вкус. Он отлично подходит как основа для супов, которым хочется добавить яркости и характера.', NULL,
  '[{"name":"Морковь: 200 г","swap":null},{"name":"Лук репчатый: 200 г","swap":null},{"name":"Стебли сельдерея: 200 г","swap":null},{"name":"Розмарин или тимьян: 2 веточки","swap":"Можно без них"},{"name":"Соевый соус: 40 г","swap":"Соус тамари","dietary_flags":["soy","gluten"],"swap_options":[{"name":"Соус тамари","dietary_flags":["soy"]}]},{"name":"Вода: 3 л","swap":null}]'::jsonb,
  '[{"text":"Овощи очистите, вымойте и нарежьте кубиком примерно по 5 мм."},{"text":"Разогрейте кастрюлю с толстым дном, выложите овощи и влейте 3 ст. л. воды."},{"text":"Томите овощи на среднем огне несколько минут почти до полного испарения воды."},{"text":"Добавьте ещё 3 ст. л. воды и томите до лёгкой мягкости овощей."},{"text":"Положите веточки розмарина или тимьяна, влейте соевый соус, перемешайте и тушите около 1 минуты."},{"text":"Влейте 3 литра холодной воды, доведите до кипения, уменьшите огонь и томите 20 минут."},{"text":"Процедите бульон."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, false, 0, '{}'::jsonb, false, ARRAY[]::text[], ARRAY['soy','gluten'], true
),
(
  'sun-dried-tomato-cashew-sauce', 'sauces', 'Соус из вяленых томатов и кешью', NULL, 5, NULL, 'easy', 4, false,
  67, 2, 4, 5, 1, ARRAY['растительное', 'без сои', 'без глютена'], NULL,
  'Насыщенный кремовый соус с ярким вкусом вяленых томатов, нежностью кешью и свежей ноткой базилика. Отлично подходит к пасте, овощам, крупам и запечённым блюдам.', NULL,
  '[{"name":"Кешью: 20 г","swap":null,"dietary_flags":["nuts"]},{"name":"Вяленые томаты: 60 г","swap":null},{"name":"Свежий базилик: 8–10 листьев","swap":null},{"name":"Чеснок: 1/2 зубчика или 1 маленький","swap":null},{"name":"Лимонный сок: 1,5 ст. л.","swap":null},{"name":"Вода: 80–100 мл","swap":null}]'::jsonb,
  '[{"text":"Замочите кешью в холодной воде от 3 часов или на ночь. Если времени мало, залейте горячей водой на 30 минут."},{"text":"Слейте воду и хорошо промойте кешью."},{"text":"Поместите кешью, вяленые томаты, базилик, чеснок, лимонный сок и 80 мл воды в чашу блендера."},{"text":"Измельчите до полностью однородной кремовой консистенции."},{"text":"Если соус получился слишком густым, добавьте ещё немного воды до желаемой консистенции."},{"text":"Попробуйте соус и при необходимости добавьте ещё немного лимонного сока."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 40, false, 0, '{}'::jsonb, false, ARRAY[]::text[], ARRAY['nuts'], true
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat, name = EXCLUDED.name, emoji = EXCLUDED.emoji, time_min = EXCLUDED.time_min,
  time_label = EXCLUDED.time_label, difficulty = EXCLUDED.difficulty, servings = EXCLUDED.servings,
  is_free = EXCLUDED.is_free, kcal = EXCLUDED.kcal, protein = EXCLUDED.protein, fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs, fiber = EXCLUDED.fiber, tags = EXCLUDED.tags, photo = EXCLUDED.photo,
  quote = EXCLUDED.quote, note = EXCLUDED.note, ingredients = EXCLUDED.ingredients, steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein, add_fat = EXCLUDED.add_fat, add_carbs = EXCLUDED.add_carbs,
  add_fiber = EXCLUDED.add_fiber, portion_grams = EXCLUDED.portion_grams, is_published = EXCLUDED.is_published,
  sort_order = EXCLUDED.sort_order, auto_addons = EXCLUDED.auto_addons, is_soup = EXCLUDED.is_soup,
  main_ingredients = EXCLUDED.main_ingredients, dietary_flags = EXCLUDED.dietary_flags,
  dietary_verified = EXCLUDED.dietary_verified, updated_at = now();

DELETE FROM recipe_categories WHERE recipe_id IN (
  'stewed-chickpeas-tomato','red-bean-spread','toast-red-bean-spread','seabass-capers-pepper-salsa',
  'light-vegetable-broth','oatmeal','baked-oatmeal-apples-cinnamon','roasted-carrot-tomato-sauce',
  'red-lentil-bread','oat-rice-bread','dark-vegetable-broth','sun-dried-tomato-cashew-sauce'
);

INSERT INTO recipe_categories (recipe_id, category_id) VALUES
  ('stewed-chickpeas-tomato','mains'), ('red-bean-spread','spreads'), ('toast-red-bean-spread','breakfasts'),
  ('seabass-capers-pepper-salsa','mains'), ('light-vegetable-broth','bases'), ('oatmeal','breakfasts'),
  ('baked-oatmeal-apples-cinnamon','breakfasts'), ('roasted-carrot-tomato-sauce','sauces'),
  ('red-lentil-bread','breads'), ('oat-rice-bread','breads'), ('dark-vegetable-broth','bases'),
  ('sun-dried-tomato-cashew-sauce','sauces');

COMMIT;
