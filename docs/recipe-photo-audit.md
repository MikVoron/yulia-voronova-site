# Аудит фото рецептов

Дата проверки: 2026-05-08

Источник правды:
- опубликованные рецепты из production DB
- локальная проверка наличия `-final` файлов в `images/recipes`

Правила проверки:
- актуальная обложка: поле `photo` указывает на `images/recipes/...`
- фото в шагах: есть хотя бы одно непустое `steps[].photo`
- финальное фото: для текущего `photo` существует ожидаемый файл `...-final.webp`

## 1. Есть актуальная обложка, хотя бы одно фото в шагах и финальное фото

Всего: 34

- Блины из зелёной гречки (`green-buckwheat-pancakes`)
- Борщ с красной фасолью (`borscht-red-beans`)
- Булгур (`side-bulgur`)
- Бурый рис (`side-brown-rice`)
- Гречка с киноа (`side-buckwheat-quinoa`)
- Гречотто (`grechotto`)
- Запечённая картошка по-деревенски (`side-potato-rustic`)
- Капуста с чечевицей, рисом и запечённой сёмгой (`cabbage-rice-lentils-salmon`)
- Котлеты из красной чечевицы (`red-lentil-cutlets`)
- Котлеты из нута и батата (`chickpea-sweet-potato-cutlets`)
- Котлеты из нута и грибов с укропом (`cutlets-chickpea-mushroom-dill`)
- Котлеты из сёмги с цветной капустой (`salmon-cauliflower-cutlets`)
- Овощной концентрат (`veggie-concentrate`)
- Оладьи из чечевицы (`lentil-pancakes-gf`)
- Паста с томатами и запечёнными перцами (`pasta-tomato-roasted-peppers`)
- Паста с тунцом и йогуртом (`pasta-tuna-yogurt`)
- Паста цельнозерновая (`side-pasta-wholegrain`)
- Пирог с капустой и сёмгой (`cabbage-salmon-pie`)
- Плов с чечевицей и грибами (`lentil-mushroom-pilaf`)
- Пшенники с яблоком (`millet-pancakes-apple`)
- Пюре из картофеля и сельдерея (`side-potato-celery-puree`)
- Салат из кольраби и огурца с йогуртом (`salad-kohlrabi-cucumber-yogurt`)
- Салат с корнем сельдерея и яблоком (`celeriac-apple-salad`)
- Соус из кешью (`cashew-sauce`)
- Суп из зелёной чечевицы с пшеном (`green-lentil-millet-soup`)
- Суп из маша (`mung-bean-soup`)
- Суп из чечевицы с овощами (`red-lentil-vegetable-soup`)
- Суп с гречкой и киноа (`buckwheat-quinoa-soup`)
- Суп-пюре из чечевицы и грибов (`red-lentil-mushroom-soup`)
- Сухарики из цельнозернового хлеба с орегано (`oregano-croutons`)
- Тефтели из нута с овощами (`chickpea-meatballs`)
- Тефтели из фасоли (`bean-meatballs`)
- Хумус (`hummus`)
- Щи с белой фасолью (`shchi-white-beans`)

## 2. Нет актуальной обложки или обложки вообще нет

Всего: 18

- Бульон №1 (светлый) (`clear-broth`)
- Бульон №2 (тёмный) (`dark-broth`)
- Картофельные котлеты с киноа (`potato-quinoa-cutlets`)
- Котлеты из брокколи, риса и грибов (`broccoli-rice-cutlets`)
- Котлеты из зелёной чечевицы (`green-lentil-cutlets`)
- Котлеты из нута и баклажана (`chickpea-eggplant-cutlets`)
- Крекеры из цельнозерновой муки (`ww-crackers`)
- Нутовый омлет (`nut-omelet`)
- Панкейки с яблочно-грушевым пюре (`apple-pear-pancakes`)
- Паштет из фасоли (`bean-paste`)
- Скрэмбл из тофу (`tofu-scramble`)
- Соус «а-ля Цезарь» (`caesar-sauce`)
- Соус из белой фасоли (`white-bean-sauce`)
- Соус из запечённых овощей (`roasted-veg-sauce`)
- Суп с нутом и лапшой (`chickpea-noodle-soup`)
- Сырники из тофу (`tofu-syrniki`)
- Тост с авокадо (`avocado-toast`)
- Уха из лосося (`salmon-ukha`)

Примечание:
- у `salmon-ukha` поле `photo` пустое
- у остальных в этом разделе обложка есть, но она не из `images/recipes/...`

## 3. Нет фото в шагах приготовления

Всего: 21

- Бульон №1 (светлый) (`clear-broth`)
- Бульон №2 (тёмный) (`dark-broth`)
- Картофельные котлеты с киноа (`potato-quinoa-cutlets`)
- Котлеты из брокколи, риса и грибов (`broccoli-rice-cutlets`)
- Котлеты из зелёной чечевицы (`green-lentil-cutlets`)
- Котлеты из нута и баклажана (`chickpea-eggplant-cutlets`)
- Крекеры из цельнозерновой муки (`ww-crackers`)
- Нутовый омлет (`nut-omelet`)
- Панкейки с яблочно-грушевым пюре (`apple-pear-pancakes`)
- Паштет из фасоли (`bean-paste`)
- Салат из запечённой свёклы, белой фасоли и рукколы (`beetroot-bean-arugula`)
- Салат с морковью, огурцом и красным перцем (`carrot-cucumber-pepper-salad`)
- Свекольный хумус (`beetroot-hummus`)
- Скрэмбл из тофу (`tofu-scramble`)
- Соус «а-ля Цезарь» (`caesar-sauce`)
- Соус из белой фасоли (`white-bean-sauce`)
- Соус из запечённых овощей (`roasted-veg-sauce`)
- Суп с нутом и лапшой (`chickpea-noodle-soup`)
- Сырники из тофу (`tofu-syrniki`)
- Тост с авокадо (`avocado-toast`)
- Уха из лосося (`salmon-ukha`)
