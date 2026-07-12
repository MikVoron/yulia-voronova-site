-- Обновление рецепта: chickpea-noodle-soup
-- Старое имя: «Суп с нутом и лапшой»
-- Новое имя:  «Суп из нута и макарон» (полная замена данных по новому ТЗ от 2026-05-08)
--
-- ID НЕ переименовываем (опубликованные id остаются прежними — см. CLAUDE.md
-- «Существующие опубликованные id не переименовывать без отдельной миграции»).
--
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-update-chickpea-noodle-soup-2026-05-08.sql
--
-- ПРИМЕЧАНИЕ:
--   • is_soup уже true (см. migrate-is-soup-flag.sql) — хлеб + сухарики авто-аддоны
--   • emoji обнуляем (по решению пользователя — эмодзи не используются)
--   • sort_order не трогаем (сохраняем текущий)
--   • carbs у мяса = 0 и fiber у мяса = 0 — общеизвестные свойства продукта
--   • fiber у тофу = 1 — взято из аналогичного аддона в новом soup-red-lentil-bulgur

UPDATE recipes SET
  name          = 'Суп из нута и макарон',
  emoji         = NULL,
  cat           = 'mains',
  time_min      = 40,
  time_label    = NULL,
  difficulty    = 'medium',
  servings      = 8,
  is_free       = false,
  kcal          = 130,
  protein       = 6,
  fat           = 2,
  carbs         = 24,
  fiber         = 5,
  tags          = ARRAY['растительное', 'без сои', 'бобовые'],
  quote         = 'Такой суп очень нравится детям. Он получается мягким, сытным и нежным по текстуре. Добавляйте в него их любимые макароны — так блюдо станет еще более привлекательнее для них.',
  ingredients   = '[
    {"name": "Нут отварной — 300 г", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Морковь — 1 шт.", "swap": null},
    {"name": "Картофель — 1 шт.", "swap": null},
    {"name": "Паприка — 1 ч. л.", "swap": null},
    {"name": "Куркума — 1/3 ч. л.", "swap": null},
    {"name": "Растительное масло — 1 ч. л.", "swap": null},
    {"name": "Цельнозерновые макароны «паутинка» — 100 г", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Вода — 2,5 л", "swap": null},
    {"name": "[Овощной концентрат](veggie-concentrate) — 5 ч. л.", "swap": "Можно без него"}
  ]'::jsonb,
  steps         = '[
    {"text": "Мелко порежьте лук, морковь натрите на мелкой тёрке."},
    {"text": "Поджарьте на растительном масле лук и морковь около 3 минут."},
    {"text": "Добавьте специи и перемешайте."},
    {"text": "Добавьте картофель, порезанный небольшими кубиками."},
    {"text": "Влейте воду. Добавьте овощной концентрат (можно без него)."},
    {"text": "Варите после закипания около 15 минут до готовности овощей."},
    {"text": "Добавьте нут и несколько половников бульона из кастрюли в блендер, взбейте нут до гладкого состояния."},
    {"text": "Влейте пюре из нута обратно в кастрюлю, добавьте макароны."},
    {"text": "После закипания варите суп до готовности макарон (время смотрите на пачке)."}
  ]'::jsonb,
  add_protein   = '[
    {"name": "Белое мясо", "amount": "70 г", "kcal": 112, "protein": 22, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Твёрдый тофу", "amount": "130 г", "kcal": 91, "protein": 13, "fat": 5, "carbs": 3, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  add_fat       = '[]'::jsonb,
  add_carbs     = '[]'::jsonb,
  add_fiber     = '[]'::jsonb,
  portion_grams = 400,
  updated_at    = now()
WHERE id = 'chickpea-noodle-soup';

-- Контрольный вывод
SELECT id, name, time_min, servings, kcal, protein, fat, carbs, fiber, is_soup, is_published
FROM recipes
WHERE id = 'chickpea-noodle-soup';
