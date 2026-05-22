/* ───────────────────────────────────────────────────────────────────────────
 * ingredients.js — кураторский справочник ингредиентов SmartPlate.
 *
 * Назначение (ТЗ §7): единый источник для
 *   • dropdown «Ингредиенты» в хедере;
 *   • чекбоксов «Основные ингредиенты для выборок» в редакторе рецепта;
 *   • заголовка и логики страницы ingredient.html.
 *
 * Это НЕ полный состав рецептов. Привязка «рецепт → ингредиенты» хранится
 * per-recipe в БД (recipes.main_ingredients, TEXT[] из id ниже).
 *
 * id ингредиента — стабильный машинный ключ (латиница), независимый от
 * русского названия. Менять id опубликованного ингредиента нельзя без
 * миграции recipes.main_ingredients.
 *
 * Расширение: добавляй элементы в GROUPS / ITEMS. Порядок в массивах =
 * порядок отображения. Пустые группы (без ингредиентов) в меню не показываются.
 *
 * Подключается обычным <script src="ingredients.js"> до inline-скриптов.
 * Экспортирует один глобал — window.SP_INGREDIENTS — чтобы не плодить
 * top-level const, конфликтующие с inline-скриптами страниц.
 * ───────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  // Группы ингредиентов. Порядок здесь = порядок колонок/секций в меню.
  var GROUPS = [
    { id: 'vegetables', name: 'Овощи' },
    { id: 'legumes',    name: 'Бобовые' },
    { id: 'grains',     name: 'Крупы и паста' },
    { id: 'mushrooms',  name: 'Грибы' },
    { id: 'fish',       name: 'Рыба' }
  ];

  // Ингредиенты. group ссылается на GROUPS[].id.
  // id — стабильный латинский ключ. Русское название можно менять, id — нет.
  // Примечание: 'salmon' (Лосось) покрывает и «сёмгу» в названиях рецептов.
  var ITEMS = [
    // Овощи
    { id: 'carrot',      name: 'Морковь',         group: 'vegetables' },
    { id: 'beetroot',    name: 'Свекла',          group: 'vegetables' },
    { id: 'kohlrabi',    name: 'Кольраби',        group: 'vegetables' },
    { id: 'cabbage',     name: 'Капуста',         group: 'vegetables' },
    { id: 'cauliflower', name: 'Цветная капуста', group: 'vegetables' },
    { id: 'zucchini',    name: 'Кабачок',         group: 'vegetables' },
    { id: 'potato',      name: 'Картофель',       group: 'vegetables' },
    { id: 'sweet-potato',name: 'Батат',           group: 'vegetables' },
    { id: 'celery',      name: 'Сельдерей',       group: 'vegetables' },
    { id: 'tomatoes',    name: 'Томаты',          group: 'vegetables' },
    // Бобовые
    { id: 'chickpeas',     name: 'Нут',               group: 'legumes' },
    { id: 'white-beans',   name: 'Белая фасоль',      group: 'legumes' },
    { id: 'red-beans',     name: 'Красная фасоль',    group: 'legumes' },
    { id: 'green-lentils', name: 'Зелёная чечевица',  group: 'legumes' },
    { id: 'red-lentils',   name: 'Красная чечевица',  group: 'legumes' },
    { id: 'mung-beans',    name: 'Маш',               group: 'legumes' },
    // Крупы и паста
    { id: 'buckwheat',   name: 'Гречка', group: 'grains' },
    { id: 'rice',        name: 'Рис',    group: 'grains' },
    { id: 'quinoa',      name: 'Киноа',  group: 'grains' },
    { id: 'millet',      name: 'Пшено',  group: 'grains' },
    { id: 'bulgur',      name: 'Булгур', group: 'grains' },
    { id: 'pasta',       name: 'Паста',  group: 'grains' },
    // Грибы
    { id: 'mushrooms',   name: 'Грибы',  group: 'mushrooms' },
    // Рыба
    { id: 'salmon',      name: 'Лосось', group: 'fish' },
    { id: 'tuna',        name: 'Тунец',  group: 'fish' }
  ];

  var ITEM_BY_ID  = {};
  var GROUP_BY_ID = {};
  ITEMS.forEach(function (it) { ITEM_BY_ID[it.id] = it; });
  GROUPS.forEach(function (g) { GROUP_BY_ID[g.id] = g; });

  // Один ингредиент по id, либо null.
  function getIngredient(id) {
    return (id && ITEM_BY_ID[id]) || null;
  }

  // Одна группа по id, либо null.
  function getGroup(id) {
    return (id && GROUP_BY_ID[id]) || null;
  }

  // Существует ли ингредиент с таким id.
  function hasIngredient(id) {
    return !!(id && ITEM_BY_ID[id]);
  }

  // Группы с их ингредиентами, в порядке GROUPS / ITEMS.
  // Возвращает [{ id, name, items: [{id,name,group}, ...] }, ...].
  // Группы без ингредиентов отбрасываются (в меню их показывать незачем).
  // Ингредиенты с неизвестной группой собираются в служебную группу 'other'.
  function byGroup() {
    var buckets = {};
    GROUPS.forEach(function (g) { buckets[g.id] = []; });
    var extras = [];
    ITEMS.forEach(function (it) {
      if (buckets[it.group]) buckets[it.group].push(it);
      else extras.push(it);
    });
    var out = GROUPS
      .map(function (g) { return { id: g.id, name: g.name, items: buckets[g.id] }; })
      .filter(function (g) { return g.items.length > 0; });
    if (extras.length) out.push({ id: 'other', name: 'Прочее', items: extras });
    return out;
  }

  global.SP_INGREDIENTS = {
    groups: GROUPS,
    items: ITEMS,
    getIngredient: getIngredient,
    getGroup: getGroup,
    hasIngredient: hasIngredient,
    byGroup: byGroup
  };
})(typeof window !== 'undefined' ? window : this);
