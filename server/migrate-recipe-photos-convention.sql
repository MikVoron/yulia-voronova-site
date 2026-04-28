-- Миграция: привести фото-шаги к конвенции start/N/final (только UPDATE steps)
--
-- Контекст: фронт platform/recipe.html авто-рендерит -start.webp после ингредиентов
-- и -final.webp как «Приятного аппетита». Поэтому в steps[].photo не должно быть
-- ни -start, ни -final. -N.webp должен соответствовать позиции пользовательского
-- шага (1-based, начиная с первого user-step).
--
-- Затронуто 7 рецептов:
--   • side-buckwheat-quinoa, cabbage-rice-lentils-salmon, pasta-tuna-yogurt,
--     cutlets-chickpea-mushroom-dill — только убрали -start.webp с шага 1.
--   • pilaf-lentils-mushrooms, grechotto, green-lentil-millet-soup — убрали -start
--     и сдвинули -N под номера шагов (физический rename файлов уже в main).
--
-- Cover для pilaf не трогаем.
--
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--           < server/migrate-recipe-photos-convention.sql

BEGIN;

-- ─── side-buckwheat-quinoa ──────────────────────────────────────────────────
UPDATE recipes SET steps = '[
  {"text": "Хорошо промойте киноа в дуршлаге под проточной водой 1–2 минуты. При необходимости можно ненадолго замочить, чтобы убрать горечь.", "photo": null},
  {"text": "Промойте гречку холодной водой.", "photo": null},
  {"text": "В кастрюлю налейте воду, доведите до кипения и посолите (вместо соли можно добавить 1 ч. л. овощного концентрата).", "photo": null},
  {"text": "Всыпьте гречку и киноа, перемешайте один раз.", "photo": "images/recipes/side-buckwheat-quinoa/side-buckwheat-quinoa-4.webp"},
  {"text": "Доведите до кипения, уменьшите огонь до минимума и накройте крышкой.", "photo": null},
  {"text": "Варите 15 минут, крышку не открывайте.", "photo": null},
  {"text": "Выключите огонь и оставьте под крышкой ещё на 10 минут.", "photo": null},
  {"text": "В конце добавьте 1 ст. л. оливкового масла и аккуратно перемешайте.", "photo": null}
]'::jsonb, updated_at = now()
WHERE id = 'side-buckwheat-quinoa';

-- ─── cabbage-rice-lentils-salmon ────────────────────────────────────────────
UPDATE recipes SET steps = '[
  {"text": "Нарежьте капусту средними кусками.", "photo": null},
  {"text": "Смешайте её с маслом, 1 ч. л. паприки и солью.", "photo": null},
  {"text": "Выложите капусту и рыбу на противень и запекайте при 200°C около 25 минут.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-3.webp"},
  {"text": "Нарежьте лук, измельчите чеснок.", "photo": null},
  {"text": "Обжарьте лук около 3 минут.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-5.webp"},
  {"text": "Добавьте чеснок и обжаривайте ещё около 30 секунд.", "photo": null},
  {"text": "Добавьте специи, перемешайте.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-7.webp"},
  {"text": "Добавьте томатную пасту и обжарьте 1 минуту.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-8.webp"},
  {"text": "Добавьте томаты, чечевицу и рис.", "photo": null},
  {"text": "Влейте воду и перемешайте.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-10.webp"},
  {"text": "Накройте крышкой и варите 20 минут, до готовности чечевицы и риса.", "photo": null},
  {"text": "Вытащите готовую рыбу и капусту из духовки.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-12.webp"},
  {"text": "Аккуратно вмешайте запечённую капусту.", "photo": null},
  {"text": "Разделите рыбу на крупные куски, выложите сверху и аккуратно перемешайте.", "photo": null},
  {"text": "Добавьте соевый соус или соль.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-15.webp"},
  {"text": "Посыпьте укропом готовое блюдо.", "photo": null}
]'::jsonb, updated_at = now()
WHERE id = 'cabbage-rice-lentils-salmon';

-- ─── pasta-tuna-yogurt ──────────────────────────────────────────────────────
UPDATE recipes SET steps = '[
  {"text": "Отварите пасту до состояния аль денте, сохранив немного воды от варки.", "photo": null},
  {"text": "Мелко порежьте чеснок и каперсы, кабачок — небольшими кубиками.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-2.webp"},
  {"text": "На сковороде слегка разогрейте масло и обжарьте чеснок.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-3.webp"},
  {"text": "Добавьте кабачок и тушите до лёгкой мягкости около 5 минут.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-4.webp"},
  {"text": "Добавьте тунец и каперсы, перемешайте и прогрейте.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-5.webp"},
  {"text": "Влейте йогурт (или соус из кешью) и добавьте немного воды от пасты для кремовой текстуры.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-6.webp"},
  {"text": "Перемешайте и сразу выключите огонь.", "photo": null},
  {"text": "Введите пасту, аккуратно перемешайте и сразу подавайте.", "photo": null}
]'::jsonb, updated_at = now()
WHERE id = 'pasta-tuna-yogurt';

-- ─── cutlets-chickpea-mushroom-dill ─────────────────────────────────────────
UPDATE recipes SET steps = '[
  {"text": "Нарежьте лук, морковь и грибы средним кубиком.", "photo": null},
  {"text": "Мелко нарежьте укроп.", "photo": null},
  {"text": "Обжарьте лук и морковь около 5 минут.", "photo": null},
  {"text": "Добавьте специи и перемешайте.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-4.webp"},
  {"text": "Добавьте грибы, перемешайте, накройте крышкой и тушите 7–10 минут.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-5.webp"},
  {"text": "Остудите овощи и добавьте к нуту.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-6.webp"},
  {"text": "Измельчите погружным блендером или в комбайне.", "photo": null},
  {"text": "Добавьте соль, муку и зелень, тщательно перемешайте.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-8.webp"},
  {"text": "Накройте и уберите в холодильник на 15–30 минут.", "photo": null},
  {"text": "Сформируйте котлеты.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-10.webp"},
  {"text": "При желании обваляйте в панировке или готовьте сразу.", "photo": null},
  {"text": "Обжарьте на небольшом количестве оливкового масла до румяной корочки.", "photo": null}
]'::jsonb, updated_at = now()
WHERE id = 'cutlets-chickpea-mushroom-dill';

-- ─── green-lentil-millet-soup ───────────────────────────────────────────────
UPDATE recipes SET steps = '[
  {"text": "Предварительно замочите зелёную чечевицу на ночь или от 3 часов."},
  {"text": "Нарежьте лук, морковь и сельдерей на мелкие кубики. Мелко порежьте чеснок.", "photo": null},
  {"text": "Обжарьте лук около 1 минуты. Добавьте чеснок, специи и перемешайте.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-3.webp"},
  {"text": "Добавьте морковь и сельдерей. Обжарьте овощи в течение 7 минут.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-4.webp"},
  {"text": "Всыпьте промытую чечевицу, залейте водой и доведите до кипения.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-5.webp"},
  {"text": "Добавьте овощной концентрат (можно без него) и варите около 15 минут.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-6.webp"},
  {"text": "Добавьте картофель и промытое пшено. Варите ещё около 15 минут до готовности пшена.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-7.webp"},
  {"text": "Добавьте чеснок и лавровый лист. Поварите 1 минуту.", "photo": null}
]'::jsonb, updated_at = now()
WHERE id = 'green-lentil-millet-soup';

-- ─── pilaf-lentils-mushrooms ────────────────────────────────────────────────
-- Cover (r.photo) указывает на -final.webp и в этой задаче не меняется.
UPDATE recipes SET steps = '[
  {"text": "Лук нарежьте и обжарьте на оливковом масле 1 минуту.", "photo": null},
  {"text": "Добавьте тёртую морковь и жарьте ещё 2 минуты.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-2.webp"},
  {"text": "Добавьте чеснок и специи, перемешайте.", "photo": null},
  {"text": "Добавьте грибы и готовьте 1 минуту.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-4.webp"},
  {"text": "Добавьте томатную пасту, перемешайте.", "photo": null},
  {"text": "Всыпьте рис и чечевицу, перемешайте.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-6.webp"},
  {"text": "Влейте воду, добавьте овощной концентрат (можно без него), посолите.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-7.webp"},
  {"text": "Доведите до кипения, накройте крышкой и готовьте на слабом огне 25 минут.", "photo": null},
  {"text": "В конце попробуйте и при необходимости досолите.", "photo": null},
  {"text": "Выключите огонь и дайте настояться под крышкой 10 минут.", "photo": null}
]'::jsonb, updated_at = now()
WHERE id = 'lentil-mushroom-pilaf';

-- ─── grechotto ──────────────────────────────────────────────────────────────
UPDATE recipes SET steps = '[
  {"text": "Лук мелко нарежьте, морковь натрите на тёрке, грибы нарежьте средними кусочками.", "photo": null},
  {"text": "Обжарьте лук на оливковом масле около 1 минуты.", "photo": "images/recipes/grechotto/grechotto-2.webp"},
  {"text": "Добавьте морковь и обжаривайте ещё 1–2 минуты.", "photo": "images/recipes/grechotto/grechotto-3.webp"},
  {"text": "Добавьте грибы и специи, перемешайте и готовьте около 1 минуты.", "photo": "images/recipes/grechotto/grechotto-4.webp"},
  {"text": "Гречку промойте и добавьте к овощам, перемешайте.", "photo": "images/recipes/grechotto/grechotto-5.webp"},
  {"text": "Влейте воду, добавьте овощной концентрат (можно без него) и соль.", "photo": null},
  {"text": "Доведите до кипения, накройте крышкой и готовьте на слабом огне 15–20 минут.", "photo": "images/recipes/grechotto/grechotto-7.webp"},
  {"text": "Фасоль пробейте блендером с 100 мл воды до кремовой консистенции.", "photo": "images/recipes/grechotto/grechotto-8.webp"},
  {"text": "Когда гречка готова, добавьте пюре из фасоли и перемешайте.", "photo": "images/recipes/grechotto/grechotto-9.webp"},
  {"text": "Дайте постоять под крышкой 5–10 минут. Можно посыпать тёртым пармезаном или неактивными пищевыми дрожжами.", "photo": null}
]'::jsonb, updated_at = now()
WHERE id = 'grechotto';

COMMIT;
