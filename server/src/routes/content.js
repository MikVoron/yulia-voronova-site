const db = require('../db');
const { authenticate, requireAdmin, optionalAuthenticate, getUserTier, userCanSeeRecipe } = require('../middleware');
const email = require('../email');
const audit = require('../audit');
const {
  normalizeDietaryFlags,
  validateVerifiedRecipeDietary,
  isRecipeCompatible,
  getUserDietaryPreferences,
} = require('../dietary');

const ACCESS_LEVELS = ['free', 'trial', 'pro'];
const ADMIN_WRITE_RATE_LIMIT = { max: 30, timeWindow: '1 hour' };
const ADMIN_NEWS_TEXT_LIMIT = 5000;
const ADMIN_RECIPE_JSON_LIMIT = 50000;
const ADMIN_AUTO_ADDONS_LIMIT = 50000;
const ADMIN_RECIPE_LIMITS = {
  id: 100,
  name: 160,
  quote: 1000,
  note: 10000,
  mediaUrl: 500,
  imgPosition: 120,
  arrayItem: 500,
  ingredients: 120,
  steps: 120,
  tags: 40,
  categories: 20,
  addons: 40,
  mainIngredients: 60,
};
const REVIEW_RECIPE_ID_LIMIT = 100;
const REVIEW_LIST_LIMIT = 100;
const VIDEO_REQUEST_GOAL = 10;
const VIDEO_REQUEST_STATUSES = ['collecting', 'goal_reached', 'planned', 'filming', 'published'];

function validateReviewRecipeId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > REVIEW_RECIPE_ID_LIMIT) {
    return null;
  }
  return value.trim();
}

// Нормализация access_level (новое поле) + backward compat с is_free.
// Возвращает { access_level, is_free } для записи в БД.
//
// Правила:
//   - access_level отсутствует (undefined / null / '') → legacy fallback:
//       is_free=true → 'free', иначе 'trial' (НЕ 'pro' — не закрываем рецепт
//       по умолчанию незаметно).
//   - access_level присутствует и валиден ('free'/'trial'/'pro') → используем его,
//       is_free = (access_level === 'free') — серверный mirror.
//   - access_level присутствует, но НЕвалиден → бросаем ошибку 400. Молчаливый
//       fallback опасен: вместо явной ошибки админ получил бы случайно
//       проставленный 'trial', и заметил бы это только при просмотре карточки.
function normalizeAccessLevel(body) {
  const raw = body ? body.access_level : undefined;
  if (raw === undefined || raw === null || raw === '') {
    const legacyFree = !!(body && body.is_free);
    return {
      access_level: legacyFree ? 'free' : 'trial',
      is_free: legacyFree,
    };
  }
  if (typeof raw === 'string' && ACCESS_LEVELS.includes(raw)) {
    return { access_level: raw, is_free: raw === 'free' };
  }
  const err = new Error('Недопустимое значение access_level (ожидается free/trial/pro)');
  err.statusCode = 400;
  err.field = 'access_level';
  throw err;
}

// Нормализация time_label: принимаем только строку до 60 символов, иначе → null.
// Колонка в БД — VARCHAR(60). Пустые строки и нестроковые значения всегда дают null.
function normalizeTimeLabel(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (trimmed.length > 60) {
    const err = new Error('time_label слишком длинный (макс. 60 символов)');
    err.statusCode = 400;
    throw err;
  }
  return trimmed;
}

function fieldError(message, field) {
  const err = new Error(message);
  err.statusCode = 400;
  err.field = field;
  return err;
}

function assertStringLimit(value, max, field) {
  if (value == null || value === '') return;
  if (typeof value !== 'string') throw fieldError(field + ': ожидается строка', field);
  if (value.length > max) throw fieldError(field + ': максимум ' + max + ' символов', field);
}

function assertArrayLimit(value, maxItems, field, maxSerialized = ADMIN_RECIPE_JSON_LIMIT) {
  if (value == null) return;
  if (!Array.isArray(value)) throw fieldError(field + ': ожидается массив', field);
  if (value.length > maxItems) throw fieldError(field + ': максимум ' + maxItems + ' элементов', field);
  for (const item of value) {
    if (typeof item === 'string' && item.length > ADMIN_RECIPE_LIMITS.arrayItem) {
      throw fieldError(field + ': элемент массива слишком длинный', field);
    }
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > maxSerialized) throw fieldError(field + ': слишком большой payload', field);
}

function assertJsonLimit(value, maxSerialized, field) {
  if (value == null) return;
  const serialized = JSON.stringify(value);
  if (serialized.length > maxSerialized) throw fieldError(field + ': слишком большой payload', field);
}

function validateNewsPayload(body, requireText) {
  const text = body?.text;
  if (requireText && (!text || !String(text).trim())) throw fieldError('Текст обязателен', 'text');
  assertStringLimit(text || '', ADMIN_NEWS_TEXT_LIMIT, 'text');
  assertStringLimit(body?.recipe_id, ADMIN_RECIPE_LIMITS.id, 'recipe_id');
  assertStringLimit(body?.badge, 80, 'badge');
  assertStringLimit(body?.label, 120, 'label');
}

function validateRecipePayload(r, requireBasics) {
  assertStringLimit(r.id, ADMIN_RECIPE_LIMITS.id, 'id');
  assertStringLimit(r.cat, 80, 'cat');
  assertStringLimit(r.name, ADMIN_RECIPE_LIMITS.name, 'name');
  assertStringLimit(r.quote, ADMIN_RECIPE_LIMITS.quote, 'quote');
  assertStringLimit(r.note, ADMIN_RECIPE_LIMITS.note, 'note');
  assertStringLimit(r.photo, ADMIN_RECIPE_LIMITS.mediaUrl, 'photo');
  assertStringLimit(r.img_position, ADMIN_RECIPE_LIMITS.imgPosition, 'img_position');
  assertStringLimit(r.vk_video, ADMIN_RECIPE_LIMITS.mediaUrl, 'vk_video');
  assertStringLimit(r.yt_video, ADMIN_RECIPE_LIMITS.mediaUrl, 'yt_video');
  assertStringLimit(r.dzen_video, ADMIN_RECIPE_LIMITS.mediaUrl, 'dzen_video');
  assertArrayLimit(r.categories, ADMIN_RECIPE_LIMITS.categories, 'categories', 4000);
  assertArrayLimit(r.ingredients, ADMIN_RECIPE_LIMITS.ingredients, 'ingredients');
  assertArrayLimit(r.steps, ADMIN_RECIPE_LIMITS.steps, 'steps');
  assertArrayLimit(r.tags, ADMIN_RECIPE_LIMITS.tags, 'tags', 12000);
  assertArrayLimit(r.add_protein, ADMIN_RECIPE_LIMITS.addons, 'add_protein', 20000);
  assertArrayLimit(r.add_fat, ADMIN_RECIPE_LIMITS.addons, 'add_fat', 20000);
  assertArrayLimit(r.add_carbs, ADMIN_RECIPE_LIMITS.addons, 'add_carbs', 20000);
  assertArrayLimit(r.add_fiber, ADMIN_RECIPE_LIMITS.addons, 'add_fiber', 20000);
  assertArrayLimit(r.main_ingredients, ADMIN_RECIPE_LIMITS.mainIngredients, 'main_ingredients', 8000);
  assertJsonLimit(r.auto_addons, ADMIN_AUTO_ADDONS_LIMIT, 'auto_addons');
  if (requireBasics && (!r.id || !r.name)) throw fieldError('id и name обязательны', !r.id ? 'id' : 'name');
}

const INGREDIENT_ID_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

function normalizeIngredientCatalogItem(body) {
  const id = String(body?.id || '').trim().toLowerCase();
  const name = String(body?.name || '').trim();
  const groupId = String(body?.group_id || body?.group || '').trim().toLowerCase();
  const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Math.trunc(Number(body.sort_order)) : 1000;
  if (!INGREDIENT_ID_RE.test(id)) {
    const err = new Error('id ингредиента: латиница/цифры/дефис, 3–50 символов');
    err.statusCode = 400;
    err.field = 'id';
    throw err;
  }
  if (!name || name.length > 80) {
    const err = new Error('Название ингредиента обязательно, максимум 80 символов');
    err.statusCode = 400;
    err.field = 'name';
    throw err;
  }
  if (!INGREDIENT_ID_RE.test(groupId)) {
    const err = new Error('Группа ингредиента обязательна');
    err.statusCode = 400;
    err.field = 'group_id';
    throw err;
  }
  return { id, name, groupId, sortOrder };
}

async function contentRoutes(fastify) {

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC — news + recipes (no auth required)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /content/ingredients — dynamic catalog entries added from admin.
  // Static defaults still come from platform/ingredients.js.
  fastify.get('/content/ingredients', async () => {
    const result = await db.query(
      `SELECT id, name, group_id AS "group", sort_order
         FROM ingredient_catalog
        ORDER BY group_id, sort_order, name`
    );
    return result.rows;
  });

  // GET /content/news — published news, newest first
  fastify.get('/content/news', async (req) => {
    await optionalAuthenticate(req);
    const dietaryPreferences = await getUserDietaryPreferences(db, req.user?.sub);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const result = await db.query(
      `SELECT n.id, n.type, n.text, n.recipe_id, n.badge, n.label, n.created_at,
              r.ingredients AS recipe_ingredients,
              r.dietary_flags AS recipe_dietary_flags,
              r.dietary_verified AS recipe_dietary_verified
         FROM news n
         LEFT JOIN recipes r ON r.id = n.recipe_id
        WHERE n.is_published = true
        ORDER BY n.created_at DESC
        LIMIT $1`,
      [limit]
    );
    return result.rows
      .filter(row => row.type !== 'recipe' || isRecipeCompatible({
        ingredients: row.recipe_ingredients,
        dietary_flags: row.recipe_dietary_flags,
        dietary_verified: row.recipe_dietary_verified,
      }, dietaryPreferences))
      .map(({ recipe_ingredients, recipe_dietary_flags, recipe_dietary_verified, ...row }) => row);
  });

  // GET /content/recipes — all published recipes
  // Stripping (ingredients, steps, note) применяется по матрице:
  //   guest        → full только для access_level='free'
  //   trial        → full для 'free' и 'trial', stripped для 'pro'
  //   active/admin → full для всех
  // См. docs/guest-mode-mvp.md §5A.3
  fastify.get('/content/recipes', async (req) => {
    await optionalAuthenticate(req);
    const tier = req.user ? await getUserTier(req.user.sub) : 'guest';
    const result = await db.query(
      `SELECT r.id, r.cat, r.name, r.emoji, r.time_min, r.time_label, r.difficulty, r.servings,
              r.is_free, r.access_level, r.is_seasonal,
              r.kcal, r.protein, r.fat, r.carbs, r.fiber, r.tags, r.photo, r.img_position, r.quote,
              r.ingredients, r.steps, r.note, r.vk_video, r.yt_video, r.dzen_video,
              r.add_protein, r.add_fat, r.add_carbs, r.add_fiber, r.auto_addons, r.is_soup,
              r.main_ingredients, r.dietary_flags, r.dietary_verified,
              r.portion_grams, r.sort_order, r.created_at,
              COALESCE(
                (SELECT array_agg(rc.category_id ORDER BY (rc.category_id = r.cat) DESC, rc.category_id)
                 FROM recipe_categories rc WHERE rc.recipe_id = r.id),
                ARRAY[r.cat]
              ) AS categories
       FROM recipes r WHERE r.is_published = true ORDER BY r.sort_order, r.created_at`
    );
    const dietaryPreferences = await getUserDietaryPreferences(db, req.user?.sub);
    return result.rows.filter(r => isRecipeCompatible(r, dietaryPreferences)).map(r => {
      // Fallback: если access_level пуст (старые данные до миграции) — выводим из is_free
      const level = r.access_level || (r.is_free ? 'free' : 'pro');
      if (userCanSeeRecipe(tier, level)) return r;
      const { ingredients, steps, note, ...meta } = r;
      return meta;
    });
  });

  // GET /content/stats — public stats (count of published recipes) for landing page
  fastify.get('/content/stats', async () => {
    const result = await db.query('SELECT COUNT(*)::int AS count FROM recipes WHERE is_published = true');
    return { recipes: result.rows[0].count };
  });

  // GET /content/seasonal — id текущего сезонного рецепта (или null, если не назначен или не опубликован).
  // Сам рецепт уже отдаётся через /content/recipes; здесь возвращаем только указатель,
  // чтобы фронт не парсил весь список.
  fastify.get('/content/seasonal', async (req) => {
    await optionalAuthenticate(req);
    const dietaryPreferences = await getUserDietaryPreferences(db, req.user?.sub);
    const result = await db.query(
      'SELECT id, ingredients, dietary_flags, dietary_verified FROM recipes WHERE is_seasonal = TRUE AND is_published = TRUE LIMIT 1'
    );
    const recipe = result.rows[0];
    return { id: recipe && isRecipeCompatible(recipe, dietaryPreferences) ? recipe.id : null };
  });

  // GET /content/categories — all categories (includes auto_addons rules)
  fastify.get('/content/categories', async (req) => {
    await optionalAuthenticate(req);
    const dietaryPreferences = await getUserDietaryPreferences(db, req.user?.sub);
    const cats = await db.query('SELECT id, name, emoji, color, description, sort_order, auto_addons FROM categories ORDER BY sort_order');
    const recipes = await db.query(
      `SELECT rc.category_id, r.id, r.ingredients, r.dietary_flags, r.dietary_verified
       FROM recipe_categories rc
       JOIN recipes r ON r.id = rc.recipe_id
       WHERE r.is_published = true
       ORDER BY r.sort_order`
    );
    const catMap = {};
    for (const c of cats.rows) {
      catMap[c.id] = { ...c, dishes: [] };
    }
    for (const r of recipes.rows.filter(r => isRecipeCompatible(r, dietaryPreferences))) {
      if (catMap[r.category_id]) catMap[r.category_id].dishes.push(r.id);
    }
    return Object.values(catMap);
  });

  // GET /content/ratings — average ratings for all recipes (public)
  fastify.get('/content/ratings', async () => {
    const result = await db.query(
      `SELECT recipe_id, ROUND(AVG(stars)::numeric, 1) AS avg, COUNT(*)::int AS count
       FROM reviews GROUP BY recipe_id`
    );
    const map = {};
    for (const row of result.rows) {
      map[row.recipe_id] = { avg: parseFloat(row.avg), count: row.count };
    }
    return map;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REVIEWS — public read, auth write
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /content/reviews/:recipeId — all reviews for a recipe (public)
  fastify.get('/content/reviews/:recipeId', async (req, reply) => {
    const recipeId = validateReviewRecipeId(req.params.recipeId);
    if (!recipeId) return reply.status(400).send({ error: 'Некорректный recipeId' });
    const result = await db.query(
      `SELECT r.id, r.stars, r.text, r.created_at, r.user_id,
              u.display_name, u.avatar
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.recipe_id = $1 ORDER BY r.created_at DESC LIMIT $2`,
      [recipeId, REVIEW_LIST_LIMIT]
    );
    return result.rows.map(row => ({
      id: row.id,
      stars: row.stars,
      text: row.text,
      createdAt: row.created_at,
      userId: row.user_id,
      author: row.display_name || 'Аноним',
      avatar: row.avatar || null
    }));
  });

  // POST /content/reviews — submit or update a review (auth required)
  fastify.post('/content/reviews', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const { recipe_id, stars, text } = req.body || {};
    const recipeId = validateReviewRecipeId(recipe_id);
    if (!recipeId || !stars) {
      return reply.status(400).send({ error: 'recipe_id и stars обязательны' });
    }
    if (stars < 1 || stars > 5) return reply.status(400).send({ error: 'stars от 1 до 5' });
    const trimmed = (text || '').trim();
    if (trimmed.length > 1000) {
      return reply.status(400).send({ error: 'Максимум 1000 символов' });
    }
    // Check recipe exists
    const exists = await db.query('SELECT id FROM recipes WHERE id=$1', [recipeId]);
    if (!exists.rows.length) return reply.status(404).send({ error: 'Рецепт не найден' });

    // Upsert: one review per user per recipe
    const result = await db.query(
      `INSERT INTO reviews (recipe_id, user_id, stars, text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (recipe_id, user_id)
       DO UPDATE SET stars = $3, text = $4, created_at = now()
       RETURNING *`,
      [recipeId, req.user.sub, stars, trimmed || null]
    );

    // Email notification to admin
    try {
      const userRow = await db.query('SELECT email, display_name FROM users WHERE id=$1', [req.user.sub]);
      const author = userRow.rows[0]?.display_name || userRow.rows[0]?.email || 'Аноним';
      const recipeRow = await db.query('SELECT name FROM recipes WHERE id=$1', [recipeId]);
      const recipeName = recipeRow.rows[0]?.name || recipeId;
      await email.sendReviewNotification(author, recipeName, stars, trimmed, recipeId);
    } catch (e) { console.error('Review email error:', e.message); }

    return result.rows[0];
  });

  // DELETE /content/reviews/:id — delete own review (auth required)
  fastify.delete('/content/reviews/:id', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const result = await db.query(
      'DELETE FROM reviews WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.user.sub]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Отзыв не найден' });
    return { ok: true };
  });

  // DELETE /admin/reviews/:id — admin can delete any review
  fastify.delete('/admin/reviews/:id', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const result = await db.query('DELETE FROM reviews WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return reply.status(404).send({ error: 'Отзыв не найден' });
    audit.log('review_delete', { userId: req.user.sub, detail: 'review#' + req.params.id, ip: req.ip });
    return { ok: true };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO REQUESTS — public progress, one authenticated vote per user
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.get('/content/video-requests/:recipeId', {
    preHandler: [optionalAuthenticate]
  }, async (req, reply) => {
    const recipeId = validateReviewRecipeId(req.params.recipeId);
    if (!recipeId) return reply.status(400).send({ error: 'Некорректный recipeId' });
    const userId = req.user?.sub || null;
    const result = await db.query(
      `SELECT r.id,
              (COALESCE(NULLIF(r.vk_video, ''), NULLIF(r.yt_video, ''), NULLIF(r.dzen_video, '')) IS NOT NULL) AS has_video,
              COALESCE(vr.goal, $2)::int AS goal,
              CASE
                WHEN COALESCE(NULLIF(r.vk_video, ''), NULLIF(r.yt_video, ''), NULLIF(r.dzen_video, '')) IS NOT NULL THEN 'published'
                ELSE COALESCE(vr.status, 'collecting')
              END AS status,
              vr.reached_at,
              COUNT(vv.user_id)::int AS votes,
              COALESCE(BOOL_OR(vv.user_id = $3::uuid), false) AS voted
       FROM recipes r
       LEFT JOIN recipe_video_requests vr ON vr.recipe_id = r.id
       LEFT JOIN recipe_video_votes vv ON vv.recipe_id = r.id
       WHERE r.id = $1 AND r.is_published = true
       GROUP BY r.id, r.vk_video, r.yt_video, r.dzen_video, vr.goal, vr.status, vr.reached_at`,
      [recipeId, VIDEO_REQUEST_GOAL, userId]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Рецепт не найден' });
    const row = result.rows[0];
    return {
      recipeId,
      votes: row.votes,
      goal: row.goal,
      voted: row.voted,
      status: row.status,
      reachedAt: row.reached_at,
      hasVideo: row.has_video,
    };
  });

  fastify.post('/content/video-requests/:recipeId/vote', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const recipeId = validateReviewRecipeId(req.params.recipeId);
    if (!recipeId) return reply.status(400).send({ error: 'Некорректный recipeId' });
    const recipe = await db.query(
      `SELECT name,
              (COALESCE(NULLIF(vk_video, ''), NULLIF(yt_video, ''), NULLIF(dzen_video, '')) IS NOT NULL) AS has_video
       FROM recipes WHERE id=$1 AND is_published=true`,
      [recipeId]
    );
    if (!recipe.rows.length) return reply.status(404).send({ error: 'Рецепт не найден' });
    if (recipe.rows[0].has_video) return reply.status(409).send({ error: 'У рецепта уже есть видео' });

    await db.query(
      `INSERT INTO recipe_video_requests (recipe_id, goal)
       VALUES ($1, $2) ON CONFLICT (recipe_id) DO NOTHING`,
      [recipeId, VIDEO_REQUEST_GOAL]
    );
    const inserted = await db.query(
      `INSERT INTO recipe_video_votes (recipe_id, user_id)
       VALUES ($1, $2) ON CONFLICT (recipe_id, user_id) DO NOTHING
       RETURNING recipe_id`,
      [recipeId, req.user.sub]
    );
    const countResult = await db.query(
      'SELECT COUNT(*)::int AS votes FROM recipe_video_votes WHERE recipe_id=$1',
      [recipeId]
    );
    const votes = countResult.rows[0].votes;
    const reached = await db.query(
      `UPDATE recipe_video_requests
       SET status='goal_reached', reached_at=COALESCE(reached_at, now()), updated_at=now()
       WHERE recipe_id=$1 AND status='collecting' AND goal <= $2
       RETURNING goal, status, reached_at`,
      [recipeId, votes]
    );
    const request = reached.rows[0] || (await db.query(
      'SELECT goal, status, reached_at FROM recipe_video_requests WHERE recipe_id=$1',
      [recipeId]
    )).rows[0];

    if (reached.rows.length && typeof email.sendVideoRequestThresholdNotification === 'function') {
      email.sendVideoRequestThresholdNotification(recipe.rows[0].name, recipeId, votes, request.goal)
        .catch(e => console.error('Video request email error:', e.message));
    }

    return {
      recipeId,
      votes,
      goal: request.goal,
      voted: true,
      inserted: inserted.rows.length > 0,
      status: request.status,
      reachedAt: request.reached_at,
      hasVideo: false,
    };
  });

  fastify.delete('/content/video-requests/:recipeId/vote', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const recipeId = validateReviewRecipeId(req.params.recipeId);
    if (!recipeId) return reply.status(400).send({ error: 'Некорректный recipeId' });
    await db.query(
      'DELETE FROM recipe_video_votes WHERE recipe_id=$1 AND user_id=$2',
      [recipeId, req.user.sub]
    );
    const result = await db.query(
      `SELECT vr.goal, vr.status, vr.reached_at, COUNT(vv.user_id)::int AS votes
       FROM recipe_video_requests vr
       LEFT JOIN recipe_video_votes vv ON vv.recipe_id=vr.recipe_id
       WHERE vr.recipe_id=$1
       GROUP BY vr.goal, vr.status, vr.reached_at`,
      [recipeId]
    );
    const row = result.rows[0] || { goal: VIDEO_REQUEST_GOAL, status: 'collecting', reached_at: null, votes: 0 };
    return {
      recipeId,
      votes: row.votes,
      goal: row.goal,
      voted: false,
      status: row.status,
      reachedAt: row.reached_at,
      hasVideo: false,
    };
  });

  fastify.get('/admin/video-requests', {
    preHandler: [authenticate, requireAdmin]
  }, async () => {
    const result = await db.query(
      `SELECT r.id AS recipe_id, r.name, r.photo,
              vr.goal, vr.reached_at, vr.created_at, vr.updated_at,
              CASE
                WHEN COALESCE(NULLIF(r.vk_video, ''), NULLIF(r.yt_video, ''), NULLIF(r.dzen_video, '')) IS NOT NULL THEN 'published'
                ELSE vr.status
              END AS status,
              COUNT(vv.user_id)::int AS votes
       FROM recipe_video_requests vr
       JOIN recipes r ON r.id=vr.recipe_id
       LEFT JOIN recipe_video_votes vv ON vv.recipe_id=vr.recipe_id
       GROUP BY r.id, r.name, r.photo, r.vk_video, r.yt_video, r.dzen_video,
                vr.goal, vr.status, vr.reached_at, vr.created_at, vr.updated_at
       ORDER BY
         CASE vr.status WHEN 'goal_reached' THEN 1 WHEN 'filming' THEN 2 WHEN 'planned' THEN 3 WHEN 'collecting' THEN 4 ELSE 5 END,
         COUNT(vv.user_id) DESC, vr.reached_at NULLS LAST, vr.created_at`,
    );
    return result.rows.map(row => ({
      recipeId: row.recipe_id,
      name: row.name,
      photo: row.photo,
      votes: row.votes,
      goal: row.goal,
      status: row.status,
      reachedAt: row.reached_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  });

  fastify.patch('/admin/video-requests/:recipeId', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const recipeId = validateReviewRecipeId(req.params.recipeId);
    const status = req.body?.status;
    if (!recipeId) return reply.status(400).send({ error: 'Некорректный recipeId' });
    if (!VIDEO_REQUEST_STATUSES.includes(status)) return reply.status(400).send({ error: 'Некорректный статус' });
    if (status === 'published') {
      const video = await db.query(
        `SELECT id FROM recipes WHERE id=$1
         AND COALESCE(NULLIF(vk_video, ''), NULLIF(yt_video, ''), NULLIF(dzen_video, '')) IS NOT NULL`,
        [recipeId]
      );
      if (!video.rows.length) return reply.status(400).send({ error: 'Сначала добавьте ссылку на видео' });
    }
    const result = await db.query(
      `UPDATE recipe_video_requests SET status=$2, updated_at=now()
       WHERE recipe_id=$1 RETURNING recipe_id, goal, status, reached_at, updated_at`,
      [recipeId, status]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Запрос не найден' });
    audit.log('video_request_status', { userId: req.user.sub, detail: 'recipe:' + recipeId + ':' + status, ip: req.ip });
    return result.rows[0];
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEWSLETTER — unsubscribe (public, token-based)
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.get('/unsubscribe', async (req, reply) => {
    const { token } = req.query || {};
    if (!token) return reply.status(400).send({ error: 'Токен не указан' });
    const result = await db.query(
      'UPDATE users SET newsletter_subscribed = false WHERE unsubscribe_token = $1 RETURNING email',
      [token]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Токен не найден' });
    reply.type('text/html').send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Отписка</title></head>'
      + '<body style="font-family:Montserrat,sans-serif;text-align:center;padding:80px 20px">'
      + '<h1 style="font-size:24px">Вы отписались от рассылки</h1>'
      + '<p style="color:#666;margin-top:12px">Вы больше не будете получать email-уведомления о новостях.</p>'
      + '<a href="/" style="color:#e8400a;font-weight:600;margin-top:20px;display:inline-block">Вернуться на платформу</a>'
      + '</body></html>'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — CRUD for news
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /admin/news — all news (including drafts)
  fastify.get('/admin/news', { preHandler: [authenticate, requireAdmin] }, async () => {
    const result = await db.query('SELECT * FROM news ORDER BY created_at DESC');
    return result.rows;
  });

  // POST /admin/news — create news (+ send newsletter if published)
  fastify.post('/admin/news', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const { type, text, recipe_id, badge, label, is_published } = req.body || {};
    try { validateNewsPayload(req.body || {}, true); }
    catch (e) { return reply.status(e.statusCode || 400).send({ error: e.message, field: e.field }); }
    const newsType = type === 'recipe' ? 'recipe' : 'news';
    let recipeName = null;
    if (newsType === 'recipe') {
      if (!recipe_id) return reply.status(400).send({ error: 'Для анонса рецепта укажите ID рецепта' });
      const recipe = await db.query(
        'SELECT name FROM recipes WHERE id=$1 AND is_published=true',
        [recipe_id]
      );
      if (!recipe.rows.length) {
        return reply.status(400).send({ error: 'Опубликованный рецепт с таким ID не найден' });
      }
      recipeName = recipe.rows[0].name;
    }
    const result = await db.query(
      `INSERT INTO news (type, text, recipe_id, badge, label, is_published)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [newsType, text.trim(), newsType === 'recipe' ? recipe_id : null, badge || null, label || null, is_published === true]
    );

    // Send newsletter to all subscribed users (async, don't block response)
    // Только если is_published явно true и новость успешно создана
    const newsId = result.rows[0]?.id;
    if (is_published === true && newsId) {
      (async () => {
        try {
          // Дедупликация: пометить новость как «рассылка отправлена»
          const lock = await db.query(
            'UPDATE news SET newsletter_sent = true WHERE id = $1 AND (newsletter_sent IS NULL OR newsletter_sent = false) RETURNING id',
            [newsId]
          );
          if (!lock.rows.length) {
            console.log('Newsletter already sent for news#' + newsId + ', skipping');
            return;
          }
          const subscribers = await db.query(
            'SELECT email, display_name, unsubscribe_token FROM users WHERE newsletter_subscribed = true AND email IS NOT NULL'
          );
          for (const sub of subscribers.rows) {
            try {
              await email.sendNewsletter(sub.email, {
                type: newsType,
                text: text.trim(),
                recipeId: newsType === 'recipe' ? recipe_id : null,
                recipeName
              }, sub.unsubscribe_token, sub.display_name);
            } catch (e) { console.error('Newsletter send error for', sub.email, ':', e.message); }
          }
          console.log(`Newsletter sent to ${subscribers.rows.length} subscribers for news#${newsId}`);
        } catch (e) { console.error('Newsletter query error:', e.message); }
      })();
    }

    audit.log('news_create', { userId: req.user.sub, detail: 'news#' + result.rows[0].id, ip: req.ip });
    return result.rows[0];
  });

  // PUT /admin/news/:id — update news
  fastify.put('/admin/news/:id', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const { type, text, recipe_id, badge, label, is_published } = req.body || {};
    try { validateNewsPayload(req.body || {}, false); }
    catch (e) { return reply.status(e.statusCode || 400).send({ error: e.message, field: e.field }); }
    const result = await db.query(
      `UPDATE news SET type=$1, text=$2, recipe_id=$3, badge=$4, label=$5, is_published=$6
       WHERE id=$7 RETURNING *`,
      [type || 'news', text, recipe_id || null, badge || null, label || null, is_published === true, req.params.id]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    audit.log('news_update', { userId: req.user.sub, detail: 'news#' + req.params.id, ip: req.ip });
    return result.rows[0];
  });

  // DELETE /admin/news/:id
  fastify.delete('/admin/news/:id', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const result = await db.query('DELETE FROM news WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    audit.log('news_delete', { userId: req.user.sub, detail: 'news#' + req.params.id, ip: req.ip });
    return { ok: true };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — CRUD for recipes
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /admin/recipes — all recipes (including drafts)
  fastify.get('/admin/recipes', { preHandler: [authenticate, requireAdmin] }, async () => {
    const result = await db.query(
      `SELECT r.*,
              COALESCE(
                (SELECT array_agg(rc.category_id ORDER BY (rc.category_id = r.cat) DESC, rc.category_id)
                 FROM recipe_categories rc WHERE rc.recipe_id = r.id),
                ARRAY[r.cat]
              ) AS categories
       FROM recipes r ORDER BY r.sort_order, r.created_at`
    );
    return result.rows;
  });

  // POST /admin/recipes — create recipe
  fastify.post('/admin/recipes', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const r = req.body || {};
    try { validateRecipePayload(r, true); }
    catch (e) { return reply.status(e.statusCode || 400).send({ error: e.message, field: e.field }); }
    // Support both: categories[] (new) and cat (legacy)
    const cats = Array.isArray(r.categories) && r.categories.length ? r.categories : (r.cat ? [r.cat] : []);
    if (!r.id || !r.name || !cats.length) return reply.status(400).send({ error: 'id, name и категория обязательны' });
    let timeLabel;
    try { timeLabel = normalizeTimeLabel(r.time_label); }
    catch (e) { return reply.status(400).send({ error: e.message, field: 'time_label' }); }
    // access_level — валидируем ДО запросов в БД. Невалидный input → 400, без silent fallback.
    let access_level, is_free;
    try { ({ access_level, is_free } = normalizeAccessLevel(r)); }
    catch (e) { return reply.status(e.statusCode || 400).send({ error: e.message, field: e.field || 'access_level' }); }
    const dietaryError = validateVerifiedRecipeDietary(r);
    if (dietaryError) return reply.status(400).send({ error: dietaryError, field: 'dietary_flags' });
    // Check id uniqueness
    const exists = await db.query('SELECT id FROM recipes WHERE id=$1', [r.id]);
    if (exists.rows.length) return reply.status(409).send({ error: 'Рецепт с таким id уже существует' });
    const primaryCat = cats[0];
    const result = await db.query(
      `INSERT INTO recipes (id, cat, name, emoji, time_min, time_label, difficulty, servings, is_free, access_level,
          kcal, protein, fat, carbs, fiber, tags, photo, img_position, quote,
          ingredients, steps, note, vk_video, yt_video, dzen_video, add_protein, add_fat, add_carbs, add_fiber,
          portion_grams, sort_order, is_published, auto_addons, is_soup, main_ingredients, dietary_flags, dietary_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)
       RETURNING *`,
      [
        r.id, primaryCat, r.name, r.emoji || '🍴', r.time_min || 30, timeLabel, r.difficulty || 'easy',
        r.servings || 4, is_free, access_level,
        r.kcal || 0, r.protein || 0, r.fat || 0, r.carbs || 0, r.fiber || 0,
        r.tags || [], r.photo || null, r.img_position || null, r.quote || null,
        JSON.stringify(r.ingredients || []), JSON.stringify(r.steps || []),
        r.note || null, r.vk_video || null, r.yt_video || null, r.dzen_video || null,
        JSON.stringify(r.add_protein || []), JSON.stringify(r.add_fat || []),
        JSON.stringify(r.add_carbs || []), JSON.stringify(r.add_fiber || []),
        r.portion_grams || 300, r.sort_order || 0, r.is_published === true,
        JSON.stringify(r.auto_addons || {}), r.is_soup === true,
        // main_ingredients (TEXT[]): кураторская навигационная привязка, не состав.
        // POST: пришёл массив → сохраняем; иначе пустой массив.
        Array.isArray(r.main_ingredients) ? r.main_ingredients : [],
        normalizeDietaryFlags(r.dietary_flags),
        r.dietary_verified === true
      ]
    );
    // Write to recipe_categories
    for (const catId of cats) {
      await db.query('INSERT INTO recipe_categories (recipe_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r.id, catId]);
    }
    audit.log('recipe_create', { userId: req.user.sub, detail: 'recipe:' + r.id, ip: req.ip });
    result.rows[0].categories = cats;
    return result.rows[0];
  });

  // PUT /admin/recipes/:id — update recipe
  fastify.put('/admin/recipes/:id', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const r = req.body || {};
    try { validateRecipePayload(r, false); }
    catch (e) { return reply.status(e.statusCode || 400).send({ error: e.message, field: e.field }); }
    // Support both: categories[] (new) and cat (legacy). Empty list = 400.
    // categories[0] is the primary category and is mirrored into recipes.cat.
    const cats = Array.isArray(r.categories) && r.categories.length ? r.categories : (r.cat ? [r.cat] : []);
    if (!cats.length) return reply.status(400).send({ error: 'Минимум одна категория обязательна', field: 'categories' });
    const primaryCat = cats[0];
    let timeLabel;
    try { timeLabel = normalizeTimeLabel(r.time_label); }
    catch (e) { return reply.status(400).send({ error: e.message, field: 'time_label' }); }
    // access_level — валидируем ДО запросов в БД. Невалидный input → 400, без silent fallback.
    let access_level, is_free;
    try { ({ access_level, is_free } = normalizeAccessLevel(r)); }
    catch (e) { return reply.status(e.statusCode || 400).send({ error: e.message, field: e.field || 'access_level' }); }
    const dietaryError = validateVerifiedRecipeDietary(r);
    if (dietaryError) return reply.status(400).send({ error: dietaryError, field: 'dietary_flags' });
    const result = await db.query(
      `UPDATE recipes SET cat=$1, name=$2, emoji=$3, time_min=$4, time_label=$5, difficulty=$6, servings=$7,
          is_free=$8, access_level=$9,
          kcal=$10, protein=$11, fat=$12, carbs=$13, fiber=$14, tags=$15,
          photo=$16, img_position=$17, quote=$18, ingredients=$19, steps=$20, note=$21,
          vk_video=$22, yt_video=$23, dzen_video=$24, add_protein=$25, add_fat=$26, add_carbs=$27, add_fiber=$28,
          portion_grams=$29, sort_order=$30, is_published=$31, auto_addons=$32, is_soup=$33,
          main_ingredients=COALESCE($34::text[], main_ingredients),
          dietary_flags=COALESCE($35::text[], dietary_flags),
          dietary_verified=COALESCE($36::boolean, dietary_verified), updated_at=now()
       WHERE id=$37 RETURNING *`,
      [
        primaryCat, r.name, r.emoji || '🍴', r.time_min || 30, timeLabel, r.difficulty || 'easy',
        r.servings || 4, is_free, access_level,
        r.kcal || 0, r.protein || 0, r.fat || 0, r.carbs || 0, r.fiber || 0,
        r.tags || [], r.photo || null, r.img_position || null, r.quote || null,
        JSON.stringify(r.ingredients || []), JSON.stringify(r.steps || []),
        r.note || null, r.vk_video || null, r.yt_video || null, r.dzen_video || null,
        JSON.stringify(r.add_protein || []), JSON.stringify(r.add_fat || []),
        JSON.stringify(r.add_carbs || []), JSON.stringify(r.add_fiber || []),
        r.portion_grams || 300, r.sort_order || 0, r.is_published === true,
        JSON.stringify(r.auto_addons || {}), r.is_soup === true,
        // main_ingredients: защита от стирания старыми путями сохранения (§11.6).
        // Поле пришло в теле → используем (массив, либо [] = явная очистка).
        // Поля нет (quick-admin и пр.) → null → COALESCE сохранит текущее значение.
        ('main_ingredients' in r)
          ? (Array.isArray(r.main_ingredients) ? r.main_ingredients : [])
          : null,
        ('dietary_flags' in r) ? normalizeDietaryFlags(r.dietary_flags) : null,
        ('dietary_verified' in r) ? r.dietary_verified === true : null,
        req.params.id
      ]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    // Sync recipe_categories: full replace (no dangling rows, no orphan primary)
    await db.query('DELETE FROM recipe_categories WHERE recipe_id = $1', [req.params.id]);
    for (const catId of cats) {
      await db.query('INSERT INTO recipe_categories (recipe_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, catId]);
    }
    const hasVideo = !!(r.vk_video || r.yt_video || r.dzen_video);
    await db.query(
      `UPDATE recipe_video_requests
       SET status = CASE
             WHEN $2::boolean THEN 'published'
             WHEN status='published' AND reached_at IS NOT NULL THEN 'goal_reached'
             WHEN status='published' THEN 'collecting'
             ELSE status
           END,
           updated_at=now()
       WHERE recipe_id=$1`,
      [req.params.id, hasVideo]
    );
    audit.log('recipe_update', { userId: req.user.sub, detail: 'recipe:' + req.params.id, ip: req.ip });
    result.rows[0].categories = cats;
    return result.rows[0];
  });

  // DELETE /admin/recipes/:id
  fastify.delete('/admin/recipes/:id', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const result = await db.query('DELETE FROM recipes WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    audit.log('recipe_delete', { userId: req.user.sub, detail: 'recipe:' + req.params.id, ip: req.ip });
    return { ok: true };
  });

  // POST /admin/recipes/:id/seasonal — пометить рецепт как «Сезонный».
  // Атомарно: снимаем флаг с любого предыдущего сезонного и ставим на указанный.
  // Только опубликованный рецепт может стать сезонным.
  fastify.post('/admin/recipes/:id/seasonal', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const id = req.params.id;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query('SELECT id, is_published FROM recipes WHERE id=$1', [id]);
      if (!exists.rows.length) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ error: 'Рецепт не найден' });
      }
      if (!exists.rows[0].is_published) {
        await client.query('ROLLBACK');
        return reply.status(409).send({ error: 'Сезонным можно сделать только опубликованный рецепт' });
      }
      await client.query('UPDATE recipes SET is_seasonal = FALSE WHERE is_seasonal = TRUE AND id <> $1', [id]);
      await client.query('UPDATE recipes SET is_seasonal = TRUE WHERE id = $1', [id]);
      await client.query('COMMIT');
      audit.log('recipe_seasonal_set', { userId: req.user.sub, detail: 'recipe:' + id, ip: req.ip });
      return { ok: true, id };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // DELETE /admin/recipes/seasonal — снять признак сезонного со всех рецептов.
  fastify.delete('/admin/recipes/seasonal', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req) => {
    await db.query('UPDATE recipes SET is_seasonal = FALSE WHERE is_seasonal = TRUE');
    audit.log('recipe_seasonal_clear', { userId: req.user.sub, detail: 'all', ip: req.ip });
    return { ok: true };
  });

  // GET /admin/recipes/:id/nutrition — get nutrition data for a recipe (used by add-panel recipeId auto-fill)
  fastify.get('/admin/recipes/:id/nutrition', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const result = await db.query(
      'SELECT id, name, kcal, protein, fat, carbs, fiber FROM recipes WHERE id=$1',
      [req.params.id]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Рецепт не найден' });
    return result.rows[0];
  });

  // POST /admin/ingredients — add/update dynamic ingredient catalog entry.
  fastify.post('/admin/ingredients', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req) => {
    const item = normalizeIngredientCatalogItem(req.body || {});
    const result = await db.query(
      `INSERT INTO ingredient_catalog (id, name, group_id, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         group_id = EXCLUDED.group_id,
         sort_order = EXCLUDED.sort_order,
         updated_at = now()
       RETURNING id, name, group_id AS "group", sort_order`,
      [item.id, item.name, item.groupId, item.sortOrder]
    );
    audit.log('ingredient_catalog_upsert', { userId: req.user.sub, detail: 'ingredient:' + item.id, ip: req.ip });
    return result.rows[0];
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — Categories
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /admin/categories — full list for admin (includes auto_addons)
  fastify.get('/admin/categories', { preHandler: [authenticate, requireAdmin] }, async () => {
    const result = await db.query('SELECT * FROM categories ORDER BY sort_order');
    return result.rows;
  });

  // POST /admin/categories — create category
  fastify.post('/admin/categories', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const { id, name, emoji, color, description, sort_order, auto_addons } = req.body || {};
    if (!id || !name) return reply.status(400).send({ error: 'id и name обязательны' });
    if (!/^[a-z0-9_-]+$/.test(id)) return reply.status(400).send({ error: 'id: только латиница, цифры, _ и -' });
    const exists = await db.query('SELECT id FROM categories WHERE id=$1', [id]);
    if (exists.rows.length) return reply.status(409).send({ error: 'Категория с таким id уже существует' });
    const result = await db.query(
      `INSERT INTO categories (id, name, emoji, color, description, sort_order, auto_addons)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, name, emoji || '', color || '#999', description || '', sort_order || 0, JSON.stringify(auto_addons || {})]
    );
    audit.log('category_create', { userId: req.user.sub, detail: 'category:' + id, ip: req.ip });
    return result.rows[0];
  });

  // PUT /admin/categories/:id
  fastify.put('/admin/categories/:id', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const { name, emoji, color, description, sort_order, auto_addons } = req.body || {};
    const result = await db.query(
      `UPDATE categories SET name=$1, emoji=$2, color=$3, description=$4, sort_order=$5, auto_addons=$6
       WHERE id=$7 RETURNING *`,
      [name, emoji, color, description, sort_order || 0, JSON.stringify(auto_addons || {}), req.params.id]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    audit.log('category_update', { userId: req.user.sub, detail: 'category:' + req.params.id, ip: req.ip });
    return result.rows[0];
  });

  // DELETE /admin/categories/:id — only if no recipes in it
  fastify.delete('/admin/categories/:id', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT }
  }, async (req, reply) => {
    const inUse = await db.query('SELECT COUNT(*)::int AS n FROM recipe_categories WHERE category_id=$1', [req.params.id]);
    if (inUse.rows[0].n > 0) return reply.status(409).send({ error: 'В категории есть рецепты (' + inUse.rows[0].n + '). Сначала удалите или перенесите.' });
    const result = await db.query('DELETE FROM categories WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    audit.log('category_delete', { userId: req.user.sub, detail: 'category:' + req.params.id, ip: req.ip });
    return { ok: true };
  });
}

module.exports = contentRoutes;
