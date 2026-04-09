const { authenticate, requireAdmin } = require('../middleware');

// USDA FoodData Central nutrient IDs
const NUTRIENT_IDS = {
  kcal: 1008,    // Energy (kcal)
  protein: 1003, // Protein (g)
  fat: 1004,     // Total lipid / fat (g)
  carbs: 1005,   // Carbohydrate, by difference (g)
  fiber: 1079    // Fiber, total dietary (g)
};

// Common Russian measure → grams conversion
const MEASURE_GRAMS = {
  'г': 1, 'гр': 1, 'грамм': 1,
  'кг': 1000, 'килограмм': 1000,
  'мл': 1, 'миллилитр': 1,
  'л': 1000, 'литр': 1000,
  'ст.л.': 15, 'ст. л.': 15, 'столовая ложка': 15, 'столовой ложки': 15, 'столовых ложек': 15,
  'ч.л.': 5, 'ч. л.': 5, 'чайная ложка': 5, 'чайной ложки': 5, 'чайных ложек': 5,
  'стакан': 250, 'стакана': 250, 'стаканов': 250,
  'щепотка': 1, 'щепотки': 1,
  'шт': null, 'шт.': null, 'штука': null, 'штуки': null, 'штук': null,
  'зубчик': 5, 'зубчика': 5, 'зубчиков': 5,
  'пучок': 30, 'пучка': 30, 'пучков': 30,
  'горсть': 30, 'горсти': 30,
  'ломтик': 30, 'ломтика': 30, 'ломтиков': 30,
  'кусок': 50, 'куска': 50, 'кусков': 50,
  'банка': 400, 'банки': 400
};

// Common Russian → English food name translations for better USDA matching
const FOOD_TRANSLATIONS = {
  'тофу': 'tofu',
  'рис': 'rice',
  'гречка': 'buckwheat',
  'овсянка': 'oats',
  'овсяные хлопья': 'oats rolled',
  'курица': 'chicken breast',
  'куриная грудка': 'chicken breast raw',
  'куриное филе': 'chicken breast raw',
  'говядина': 'beef',
  'свинина': 'pork',
  'лосось': 'salmon',
  'тунец': 'tuna',
  'треска': 'cod',
  'креветки': 'shrimp',
  'яйцо': 'egg whole raw',
  'яйца': 'egg whole raw',
  'молоко': 'milk whole',
  'кефир': 'kefir',
  'творог': 'cottage cheese',
  'сыр': 'cheese cheddar',
  'сливочное масло': 'butter',
  'оливковое масло': 'olive oil',
  'подсолнечное масло': 'sunflower oil',
  'растительное масло': 'vegetable oil',
  'кокосовое масло': 'coconut oil',
  'мука': 'wheat flour',
  'сахар': 'sugar',
  'мёд': 'honey',
  'мед': 'honey',
  'соль': 'salt',
  'перец': 'black pepper',
  'чеснок': 'garlic raw',
  'лук': 'onion raw',
  'лук репчатый': 'onion raw',
  'морковь': 'carrot raw',
  'картофель': 'potato raw',
  'помидор': 'tomato raw',
  'помидоры': 'tomato raw',
  'огурец': 'cucumber raw',
  'огурцы': 'cucumber raw',
  'капуста': 'cabbage raw',
  'брокколи': 'broccoli raw',
  'шпинат': 'spinach raw',
  'авокадо': 'avocado raw',
  'банан': 'banana raw',
  'яблоко': 'apple raw',
  'лимон': 'lemon raw',
  'нут': 'chickpeas',
  'фасоль': 'kidney beans',
  'чечевица': 'lentils',
  'макароны': 'pasta dry',
  'спагетти': 'spaghetti dry',
  'хлеб': 'bread white',
  'базилик': 'basil fresh',
  'петрушка': 'parsley fresh',
  'укроп': 'dill fresh',
  'имбирь': 'ginger root raw',
  'соевый соус': 'soy sauce',
  'томатная паста': 'tomato paste',
  'сливки': 'cream',
  'сметана': 'sour cream',
  'йогурт': 'yogurt plain',
  'миндаль': 'almonds',
  'грецкий орех': 'walnuts',
  'кешью': 'cashews',
  'арахис': 'peanuts',
  'семена чиа': 'chia seeds',
  'семена льна': 'flaxseed',
  'кунжут': 'sesame seeds',
  'какао': 'cocoa powder',
  'шоколад': 'chocolate dark'
};

/**
 * Parse a Russian ingredient string like "300 г тофу" or "2 ст.л. оливкового масла"
 * Returns { amount_g, query, raw }
 */
function parseIngredient(nameStr) {
  const raw = nameStr.trim();
  const result = { raw, query: raw, amount_g: null, confidence: 'low' };

  // Try pattern: NUMBER UNIT REST  (e.g. "300 г тофу", "2 ст.л. масла")
  const match = raw.match(/^(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|кг|килограмм|мл|миллилитр|л|литр|ст\.?\s*л\.?|столов\S*|ч\.?\s*л\.?|чайн\S*|стакан\S*|щепот\S*|шт\.?|штук\S*|зубч\S*|пучо?к?\S*|горст\S*|ломти\S*|кусо?к?\S*|банк\S*)\s+(.+)$/i);

  if (match) {
    const num = parseFloat(match[1].replace(',', '.'));
    const unitRaw = match[2].toLowerCase().replace(/\s+/g, '');
    const foodName = match[3].trim();

    // Find matching unit
    let grams = null;
    for (const [unit, g] of Object.entries(MEASURE_GRAMS)) {
      if (unitRaw === unit.replace(/\s+/g, '') || unitRaw.startsWith(unit.replace(/\s+/g, '').slice(0, 3))) {
        grams = g;
        break;
      }
    }

    if (grams !== null) {
      result.amount_g = Math.round(num * grams);
      result.confidence = 'high';
    } else {
      // Unit like "шт" — unknown weight
      result.amount_g = null;
      result.confidence = 'low';
    }
    result.query = foodName;
  } else {
    // Try pattern: just NUMBER + REST (e.g. "3 помидора")
    const simpleMatch = raw.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
    if (simpleMatch) {
      result.query = simpleMatch[2].trim();
      result.confidence = 'low';
    }
  }

  // Translate to English for better USDA matching
  const queryLower = result.query.toLowerCase();
  for (const [ru, en] of Object.entries(FOOD_TRANSLATIONS)) {
    if (queryLower === ru || queryLower.includes(ru)) {
      result.queryEn = en;
      break;
    }
  }

  return result;
}

/**
 * Search USDA FoodData Central for a food item
 */
async function searchUSDA(query, apiKey) {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('dataType', 'SR Legacy,Foundation');
  url.searchParams.set('pageSize', '5');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`USDA API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Extract nutrition per 100g from a USDA food item
 */
function extractNutrients(food) {
  const nutrients = {};
  for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
    const found = (food.foodNutrients || []).find(n => n.nutrientId === id);
    nutrients[key] = found ? Math.round(found.value * 10) / 10 : 0;
  }
  return nutrients;
}

async function nutritionRoutes(fastify) {

  // POST /admin/nutrition/calculate — calculate КБЖУ for a list of ingredients via USDA
  fastify.post('/admin/nutrition/calculate', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { ingredients, servings } = req.body || {};

    if (!ingredients || !Array.isArray(ingredients) || !ingredients.length) {
      return reply.status(400).send({ error: 'Массив ингредиентов обязателен' });
    }

    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) {
      return reply.status(500).send({ error: 'USDA_API_KEY не настроен на сервере' });
    }

    const portionCount = parseInt(servings) || 1;
    const items = [];
    const warnings = [];
    const total = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };

    for (const ingr of ingredients) {
      const nameStr = typeof ingr === 'string' ? ingr : (ingr.name || '');
      if (!nameStr.trim()) continue;

      const parsed = parseIngredient(nameStr);
      const itemResult = {
        original: parsed.raw,
        amount_g: parsed.amount_g,
        matched: null,
        fdcId: null,
        confidence: 'not_found',
        nutrition: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
        alternatives: []
      };

      try {
        // Search with English translation first, fallback to original
        const queries = parsed.queryEn ? [parsed.queryEn, parsed.query] : [parsed.query];
        let bestFood = null;

        for (const q of queries) {
          const data = await searchUSDA(q, apiKey);
          if (data.foods && data.foods.length > 0) {
            bestFood = data.foods[0];
            // Collect alternatives
            itemResult.alternatives = data.foods.slice(0, 3).map(f => ({
              fdcId: f.fdcId,
              description: f.description,
              dataType: f.dataType
            }));
            break;
          }
        }

        if (bestFood) {
          itemResult.matched = bestFood.description;
          itemResult.fdcId = bestFood.fdcId;

          const per100g = extractNutrients(bestFood);

          if (parsed.amount_g && parsed.amount_g > 0) {
            // Calculate for actual weight
            const factor = parsed.amount_g / 100;
            itemResult.nutrition = {
              kcal: Math.round(per100g.kcal * factor),
              protein: Math.round(per100g.protein * factor * 10) / 10,
              fat: Math.round(per100g.fat * factor * 10) / 10,
              carbs: Math.round(per100g.carbs * factor * 10) / 10,
              fiber: Math.round(per100g.fiber * factor * 10) / 10
            };
            itemResult.confidence = parsed.confidence === 'high' ? 'high' : 'medium';
          } else {
            // Weight unknown — show per 100g as reference, flag as needs review
            itemResult.nutrition = per100g;
            itemResult.amount_g = 100;
            itemResult.confidence = 'medium';
            warnings.push(parsed.raw + ' — вес не определён, показано на 100г');
          }

          // Accumulate total
          for (const key of Object.keys(total)) {
            total[key] += itemResult.nutrition[key];
          }
        } else {
          itemResult.confidence = 'not_found';
          warnings.push(parsed.raw + ' — не найдено в USDA');
        }
      } catch (err) {
        fastify.log.error(err, 'USDA search failed for: ' + parsed.query);
        itemResult.confidence = 'not_found';
        warnings.push(parsed.raw + ' — ошибка поиска USDA');
      }

      items.push(itemResult);
    }

    // Round totals
    for (const key of Object.keys(total)) {
      total[key] = Math.round(total[key] * 10) / 10;
    }

    // Per serving
    const per_serving = {};
    for (const key of Object.keys(total)) {
      per_serving[key] = Math.round(total[key] / portionCount * 10) / 10;
    }
    per_serving.kcal = Math.round(per_serving.kcal);

    return { total, per_serving, items, warnings, servings: portionCount };
  });
}

module.exports = nutritionRoutes;
