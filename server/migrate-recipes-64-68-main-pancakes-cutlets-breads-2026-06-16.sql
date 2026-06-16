-- Recipes 64-68 from user text.
-- strict / No Guessing. Follow-up clarifications from 2026-06-16 are encoded:
--   * pasta-shrimp-cauliflower-cashew uses 1 garlic clove in sauce and 1 for shrimp.
--   * green-shakshuka has bread add-on amount "1 ломтик"; parsley is optional without KBZHU delta.
--   * wholegrain-flour-pancakes is tagged plant-based; cow milk replacement is visibly marked as non-plant-based and flagged as milk.
--   * wholegrain-flour-pancakes honey omit has explicit per-serving KBZHU delta; syrup replacement is rename-only.
--   * cutlets-chicken-mung-zucchini belongs to cutlets.
--   * lentil-crackers belongs to breads; fat remains 0 as provided.
-- Photos are deferred by user, so photo is NULL.
-- Apply:
--   scp server/migrate-recipes-64-68-main-pancakes-cutlets-breads-2026-06-16.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipes-64-68-main-pancakes-cutlets-breads-2026-06-16.sql"

BEGIN;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, is_soup, main_ingredients,
  dietary_flags, dietary_verified
) VALUES (
  'pasta-shrimp-cauliflower-cashew',
  'mains',
  'Паста с креветками и соусом из цветной капусты и кешью',
  NULL,
  30,
  NULL,
  'medium',
  3,
  false,
  501, 31, 11, 63, 10,
  ARRAY['без сои', 'рыбное'],
  NULL,
  'Рекомендую перемешивать пасту с соусом непосредственно перед подачей, чтобы она сохранила текстуру al dente. Сыр здесь не нужен: креветки и нежный соус из цветной капусты и кешью уже дают блюду достаточно вкуса и белка.',
  NULL,
  '[
    {"name": "Паста сухая: 250 г", "swap": null, "dietary_flags": ["gluten"]},
    {"name": "Креветки очищенные: 200 г", "swap": null, "dietary_flags": ["fish"]},
    {"name": "Цветная капуста: 400 г", "swap": null},
    {"name": "Кешью: 60 г", "swap": null, "dietary_flags": ["nuts"]},
    {"name": "Вода от варки капусты: 200 мл", "swap": null},
    {"name": "Чеснок: 2 зубчика", "swap": null},
    {"name": "Растительное масло: 1 ч. л.", "swap": null},
    {"name": "Лимонный сок: 1 ст. л.", "swap": null},
    {"name": "Соль: 0,5 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Замочите кешью в кипятке на 20–30 минут."},
    {"text": "Цветную капусту разберите на соцветия и отварите 7–8 минут до мягкости."},
    {"text": "Сделайте соус в блендере из цветной капусты, кешью, 1 дольки чеснока, лимонного сока, соли и воды от варки капусты. Взбейте до максимально гладкой текстуры."},
    {"text": "Обжарьте вторую дольку чеснока на растительном масле в течение нескольких секунд, затем добавьте вареные креветки и готовьте еще около 1 минуты."},
    {"text": "Добавьте соус из цветной капусты, перемешайте."},
    {"text": "Отварите пасту аль денте, как указано на упаковке."},
    {"text": "Соедините пасту и соус, для остроты можно добавить молотый чили перец."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  400,
  false,
  0,
  false,
  ARRAY['cauliflower', 'shrimp'],
  ARRAY['fish', 'gluten', 'nuts'],
  true
),
(
  'green-shakshuka',
  'mains',
  'Зеленая шакшука',
  NULL,
  20,
  NULL,
  'medium',
  3,
  false,
  223, 15, 14, 9, 3,
  ARRAY['без сои', 'без глютена'],
  NULL,
  'Готовую шакшуку лучше подавать сразу: тогда шпинат останется ярким, а яйца — нежными.',
  NULL,
  '[
    {"name": "Яйца: 6 шт.", "swap": null, "dietary_flags": ["eggs"]},
    {"name": "Шпинат: 100 г", "swap": null},
    {"name": "Кабачок: 250 г", "swap": null},
    {"name": "Лук репчатый: 1 шт.", "swap": null},
    {"name": "Сельдерей стеблевой: 1 палочка", "swap": null},
    {"name": "Оливковое масло: 1 ст. л.", "swap": null},
    {"name": "Петрушка: 10 г", "swap": null, "omit": "Можно без неё"},
    {"name": "Соль: 1/3 ч. л.", "swap": null},
    {"name": "Молотый кориандр: 1/3 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Лук и сельдерей нарежьте мелким кубиком и обжарьте на оливковом масле 5–7 минут до мягкости."},
    {"text": "Добавьте кабачок, порезанный мелким кубиком, и готовьте 7–10 минут, пока он не станет мягким, а лишняя влага не выпарится."},
    {"text": "Добавьте кориандр, прогрейте 30 секунд, чтобы специя раскрылась."},
    {"text": "Добавьте шпинат. Крупные листья можно слегка порезать, маленькие оставить целыми. Готовьте 1–2 минуты, пока он уменьшится в объеме."},
    {"text": "Добавьте петрушку и соль."},
    {"text": "Сделайте ложкой 6 углублений и аккуратно разбейте яйца."},
    {"text": "Накройте крышкой и готовьте 5–8 минут до желаемой степени готовности желтков."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "Цельнозерновой хлеб", "amount": "1 ломтик", "kcal": 70, "protein": 3, "fat": 0, "carbs": 15, "fiber": 3}
  ]'::jsonb,
  '[]'::jsonb,
  280,
  false,
  0,
  false,
  ARRAY['zucchini'],
  ARRAY['eggs'],
  true
),
(
  'wholegrain-flour-pancakes',
  'pancakes',
  'Оладьи из цельнозерновой муки',
  NULL,
  30,
  NULL,
  'easy',
  4,
  false,
  422, 14, 7, 81, 8,
  ARRAY['растительное'],
  NULL,
  'Если сделать оладьи полностью на цельнозерновой муке, они будут полезнее и с большим количеством клетчатки, но плотнее по текстуре. Банан добавляет сладость, поэтому мёда или сиропа можно класть меньше.',
  'Всего оладий: 16. 1 порция: 4 оладьи.',
  '[
    {"name": "Мука цельнозерновая: 250 г", "swap": null, "dietary_flags": ["gluten"]},
    {"name": "Мука пшеничная белая: 100 г", "swap": null, "dietary_flags": ["gluten"]},
    {
      "name": "Соевое молоко: 360 мл",
      "swap": "Коровье молоко 2,5% (рецепт перестанет быть растительным)",
      "swap_options": [
        {"name": "Коровье молоко 2,5% (рецепт перестанет быть растительным)", "dietary_flags": ["milk"]}
      ],
      "swap_nutrition": {
        "original": {"kcal": 49, "protein": 3, "fat": 2, "carbs": 6, "fiber": 0},
        "replacement": {"kcal": 49, "protein": 3, "fat": 2, "carbs": 4, "fiber": 0}
      }
    },
    {"name": "Разрыхлитель: 2 ч. л.", "swap": null},
    {"name": "Яблочный уксус: 1 ч. л.", "swap": null},
    {
      "name": "Мёд: 2 ст. л.",
      "swap": "Любой сироп",
      "omit": "Можно без него",
      "dietary_flags": ["animal_products"],
      "swap_options": [
        {"name": "Любой сироп", "dietary_flags": []},
        {"name": "Без мёда", "dietary_flags": []}
      ],
      "omit_nutrition": {"kcal": 39, "protein": 0, "fat": 0, "carbs": 9, "fiber": 0},
      "omit_delta": {"kcal": -39, "protein": 0, "fat": 0, "carbs": -9, "fiber": 0}
    },
    {"name": "Оливковое масло: 1 ст. л.", "swap": null},
    {"name": "Банан мягкий: 1 шт.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Смешайте обе муки и разрыхлитель."},
    {"text": "В отдельной миске смешайте молоко, мёд, оливковое масло, яблочный уксус и размятый вилкой банан."},
    {"text": "Соедините сухие и жидкие ингредиенты и перемешайте до однородности, не вымешивая слишком долго."},
    {"text": "Оставьте тесто на 10 минут."},
    {"text": "Разогрейте сковороду и слегка смажьте её маслом только перед первой партией."},
    {"text": "Жарьте оладьи на среднем огне до румяности с двух сторон."}
  ]'::jsonb,
  '[
    {"name": "Йогурт 2–5%", "amount": "150 г", "kcal": 95, "protein": 7.5, "fat": 2.5, "carbs": 10.5, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "Ягоды", "amount": "80 г", "kcal": 32, "protein": 1, "fat": 0, "carbs": 7, "fiber": 3}
  ]'::jsonb,
  NULL,
  false,
  0,
  false,
  ARRAY[]::text[],
  ARRAY['animal_products', 'gluten'],
  true
),
(
  'cutlets-chicken-mung-zucchini',
  'cutlets',
  'Куриные котлеты с машем и кабачком',
  NULL,
  50,
  NULL,
  'medium',
  8,
  false,
  119, 17, 2, 8, 2,
  ARRAY['без глютена', 'без сои'],
  NULL,
  'Маш можно измельчить вместе с курицей и луком — так текстура котлет получится более однородной. Замороженные котлеты удобно запекать сразу без размораживания, просто немного увеличив время приготовления.',
  NULL,
  '[
    {"name": "Куриная грудка: 500 г", "swap": null, "dietary_flags": ["meat"]},
    {"name": "Маш сухой: 80 г", "swap": null},
    {"name": "Кабачок: 1 средний", "swap": null},
    {"name": "Лук: 1 средний", "swap": null},
    {"name": "Петрушка: 10 г", "swap": null},
    {"name": "Орегано: 1/2 ч. л.", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Замочите маш на ночь или минимум на 6 часов."},
    {"text": "Промойте маш, залейте 400 мл воды и варите около 20 минут после закипания до мягкости."},
    {"text": "Слейте воду, остудите и разомните маш вилкой."},
    {"text": "Куриную грудку вместе с луком и орегано пропустите через мясорубку или измельчите в комбайне."},
    {"text": "Кабачок натрите на мелкой терке и хорошо отожмите. Петрушку мелко нарежьте."},
    {"text": "Смешайте куриный фарш, маш, кабачок и петрушку."},
    {"text": "Добавьте соль и хорошо вымесите фарш 3–5 минут до однородности. При желании уберите его в холодильник на 15 минут."},
    {"text": "Влажными руками сформируйте котлеты и выложите на противень, застеленный бумагой для выпечки. Лишние котлеты можно сразу заморозить на будущее и запечь в другой день."},
    {"text": "Запекайте в разогретой до 180 °C духовке около 25 минут. За 3–5 минут до конца можно включить верхний нагрев или гриль для легкой золотистой корочки."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  90,
  false,
  0,
  false,
  ARRAY['chicken', 'mung-beans'],
  ARRAY['meat'],
  true
),
(
  'lentil-crackers',
  'breads',
  'Крекеры из чечевицы',
  NULL,
  40,
  NULL,
  'easy',
  6,
  false,
  118, 9, 0, 20, 10,
  ARRAY['без глютена', 'растительное', 'без сои'],
  NULL,
  'Хрустящие чипсы из чечевицы можно грызть как полезный перекус или подавать вместо сухариков и хлеба к супу.',
  NULL,
  '[
    {"name": "Красная чечевица сухая: 200 г", "swap": null},
    {"name": "Вода: 120 г", "swap": null},
    {"name": "Чеснок: 1 зубчик", "swap": null},
    {"name": "Соль: 1/2 ч. л.", "swap": null},
    {"name": "Паприка: 1/2 ч. л.", "swap": null},
    {"name": "Кориандр: 1/2 ч. л.", "swap": null},
    {"name": "Оливковое масло: 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Замочите чечевицу на ночь или минимум на 2 часа."},
    {"text": "Поместите в блендер чечевицу, соль, специи и воду."},
    {"text": "Пробейте до однородной, гладкой консистенции."},
    {"text": "Переложите массу на противень, застеленный бумагой для выпечки."},
    {"text": "Равномерно распределите массу по всей поверхности бумаги лопаткой или ложкой слоем около 3 мм."},
    {"text": "Выпекайте 20 минут при температуре 180 °C."},
    {"text": "Немного остудите и аккуратно снимите пласт с бумаги, затем нарежьте его на произвольные квадратики ножом, ножницами или ножом для пиццы."},
    {"text": "Сбрызните кусочки 1 ч. л. оливкового масла, перемешайте и поставьте в духовку еще на 10 минут."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  25,
  false,
  0,
  false,
  ARRAY['red-lentils'],
  ARRAY[]::text[],
  true
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
  time_label = EXCLUDED.time_label,
  difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  is_free = EXCLUDED.is_free,
  kcal = EXCLUDED.kcal,
  protein = EXCLUDED.protein,
  fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs,
  fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags,
  photo = EXCLUDED.photo,
  quote = EXCLUDED.quote,
  note = EXCLUDED.note,
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs,
  add_fiber = EXCLUDED.add_fiber,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  sort_order = EXCLUDED.sort_order,
  is_soup = EXCLUDED.is_soup,
  main_ingredients = EXCLUDED.main_ingredients,
  dietary_flags = EXCLUDED.dietary_flags,
  dietary_verified = EXCLUDED.dietary_verified,
  updated_at = now();

DELETE FROM recipe_categories
WHERE recipe_id IN (
  'pasta-shrimp-cauliflower-cashew',
  'green-shakshuka',
  'wholegrain-flour-pancakes',
  'cutlets-chicken-mung-zucchini',
  'lentil-crackers'
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES
  ('pasta-shrimp-cauliflower-cashew', 'mains'),
  ('green-shakshuka', 'mains'),
  ('wholegrain-flour-pancakes', 'pancakes'),
  ('cutlets-chicken-mung-zucchini', 'cutlets'),
  ('lentil-crackers', 'breads');

COMMIT;
