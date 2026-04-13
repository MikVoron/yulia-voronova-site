const db = require('../db');
const { authenticate, requireAdmin, optionalAuthenticate, checkActiveSubscription } = require('../middleware');
const email = require('../email');
const audit = require('../audit');

async function contentRoutes(fastify) {

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC — news + recipes (no auth required)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /content/news — published news, newest first
  fastify.get('/content/news', async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const result = await db.query(
      'SELECT id, type, text, recipe_id, badge, label, created_at FROM news WHERE is_published = true ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  });

  // GET /content/recipes — all published recipes
  // Paid fields (ingredients, steps, note) are stripped for users without active subscription
  fastify.get('/content/recipes', async (req) => {
    await optionalAuthenticate(req);
    let hasAccess = false;
    if (req.user) {
      const userRes = await db.query('SELECT role FROM users WHERE id=$1', [req.user.sub]);
      if (userRes.rows.length && userRes.rows[0].role === 'admin') {
        hasAccess = true;
      } else {
        hasAccess = await checkActiveSubscription(req.user.sub);
      }
    }
    const result = await db.query(
      `SELECT r.id, r.cat, r.name, r.emoji, r.time_min, r.difficulty, r.servings, r.is_free,
              r.kcal, r.protein, r.fat, r.carbs, r.fiber, r.tags, r.photo, r.img_position, r.quote,
              r.ingredients, r.steps, r.note, r.vk_video, r.yt_video, r.dzen_video,
              r.add_protein, r.add_fat, r.add_carbs, r.add_fiber, r.auto_addons,
              r.portion_grams, r.sort_order, r.created_at,
              COALESCE(
                (SELECT array_agg(rc.category_id) FROM recipe_categories rc WHERE rc.recipe_id = r.id),
                ARRAY[r.cat]
              ) AS categories
       FROM recipes r WHERE r.is_published = true ORDER BY r.sort_order, r.created_at`
    );
    if (hasAccess) return result.rows;
    return result.rows.map(r => {
      if (r.is_free) return r;
      const { ingredients, steps, note, ...meta } = r;
      return meta;
    });
  });

  // GET /content/stats — public stats (count of published recipes) for landing page
  fastify.get('/content/stats', async () => {
    const result = await db.query('SELECT COUNT(*)::int AS count FROM recipes WHERE is_published = true');
    return { recipes: result.rows[0].count };
  });

  // GET /content/categories — all categories (includes auto_addons rules)
  fastify.get('/content/categories', async () => {
    const cats = await db.query('SELECT id, name, emoji, color, description, sort_order, auto_addons FROM categories ORDER BY sort_order');
    const recipes = await db.query(
      `SELECT rc.category_id, r.id
       FROM recipe_categories rc
       JOIN recipes r ON r.id = rc.recipe_id
       WHERE r.is_published = true
       ORDER BY r.sort_order`
    );
    const catMap = {};
    for (const c of cats.rows) {
      catMap[c.id] = { ...c, dishes: [] };
    }
    for (const r of recipes.rows) {
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
  fastify.get('/content/reviews/:recipeId', async (req) => {
    const result = await db.query(
      `SELECT r.id, r.stars, r.text, r.created_at, r.user_id,
              u.display_name, u.avatar
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.recipe_id = $1 ORDER BY r.created_at DESC`,
      [req.params.recipeId]
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
    if (!recipe_id || !stars) {
      return reply.status(400).send({ error: 'recipe_id и stars обязательны' });
    }
    if (stars < 1 || stars > 5) return reply.status(400).send({ error: 'stars от 1 до 5' });
    const trimmed = (text || '').trim();
    if (trimmed.length > 1000) {
      return reply.status(400).send({ error: 'Максимум 1000 символов' });
    }
    // Check recipe exists
    const exists = await db.query('SELECT id FROM recipes WHERE id=$1', [recipe_id]);
    if (!exists.rows.length) return reply.status(404).send({ error: 'Рецепт не найден' });

    // Upsert: one review per user per recipe
    const result = await db.query(
      `INSERT INTO reviews (recipe_id, user_id, stars, text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (recipe_id, user_id)
       DO UPDATE SET stars = $3, text = $4, created_at = now()
       RETURNING *`,
      [recipe_id, req.user.sub, stars, trimmed || null]
    );

    // Email notification to admin
    try {
      const userRow = await db.query('SELECT email, display_name FROM users WHERE id=$1', [req.user.sub]);
      const author = userRow.rows[0]?.display_name || userRow.rows[0]?.email || 'Аноним';
      const recipeRow = await db.query('SELECT name FROM recipes WHERE id=$1', [recipe_id]);
      const recipeName = recipeRow.rows[0]?.name || recipe_id;
      await email.sendReviewNotification(author, recipeName, stars, trimmed, recipe_id);
    } catch (e) { console.error('Review email error:', e.message); }

    return result.rows[0];
  });

  // DELETE /content/reviews/:id — delete own review (auth required)
  fastify.delete('/content/reviews/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const result = await db.query(
      'DELETE FROM reviews WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.user.sub]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Отзыв не найден' });
    return { ok: true };
  });

  // DELETE /admin/reviews/:id — admin can delete any review
  fastify.delete('/admin/reviews/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const result = await db.query('DELETE FROM reviews WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return reply.status(404).send({ error: 'Отзыв не найден' });
    audit.log('review_delete', { userId: req.user.sub, detail: 'review#' + req.params.id, ip: req.ip });
    return { ok: true };
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
  fastify.post('/admin/news', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { type, text, recipe_id, badge, label, is_published } = req.body || {};
    if (!text || !text.trim()) return reply.status(400).send({ error: 'Текст обязателен' });
    const result = await db.query(
      `INSERT INTO news (type, text, recipe_id, badge, label, is_published)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [type || 'news', text.trim(), recipe_id || null, badge || null, label || null, is_published === true]
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
            'SELECT email, unsubscribe_token FROM users WHERE newsletter_subscribed = true AND email IS NOT NULL'
          );
          for (const sub of subscribers.rows) {
            try {
              await email.sendNewsletter(sub.email, text.trim(), sub.unsubscribe_token);
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
  fastify.put('/admin/news/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { type, text, recipe_id, badge, label, is_published } = req.body || {};
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
  fastify.delete('/admin/news/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
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
                (SELECT array_agg(rc.category_id) FROM recipe_categories rc WHERE rc.recipe_id = r.id),
                ARRAY[r.cat]
              ) AS categories
       FROM recipes r ORDER BY r.sort_order, r.created_at`
    );
    return result.rows;
  });

  // POST /admin/recipes — create recipe
  fastify.post('/admin/recipes', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const r = req.body || {};
    // Support both: categories[] (new) and cat (legacy)
    const cats = Array.isArray(r.categories) && r.categories.length ? r.categories : (r.cat ? [r.cat] : []);
    if (!r.id || !r.name || !cats.length) return reply.status(400).send({ error: 'id, name и категория обязательны' });
    // Check id uniqueness
    const exists = await db.query('SELECT id FROM recipes WHERE id=$1', [r.id]);
    if (exists.rows.length) return reply.status(409).send({ error: 'Рецепт с таким id уже существует' });
    const primaryCat = cats[0];
    const result = await db.query(
      `INSERT INTO recipes (id, cat, name, emoji, time_min, difficulty, servings, is_free,
          kcal, protein, fat, carbs, fiber, tags, photo, img_position, quote,
          ingredients, steps, note, vk_video, yt_video, dzen_video, add_protein, add_fat, add_carbs, add_fiber,
          portion_grams, sort_order, is_published, auto_addons)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
       RETURNING *`,
      [
        r.id, primaryCat, r.name, r.emoji || '🍴', r.time_min || 30, r.difficulty || 'easy',
        r.servings || 4, r.is_free || false,
        r.kcal || 0, r.protein || 0, r.fat || 0, r.carbs || 0, r.fiber || 0,
        r.tags || [], r.photo || null, r.img_position || null, r.quote || null,
        JSON.stringify(r.ingredients || []), JSON.stringify(r.steps || []),
        r.note || null, r.vk_video || null, r.yt_video || null, r.dzen_video || null,
        JSON.stringify(r.add_protein || []), JSON.stringify(r.add_fat || []),
        JSON.stringify(r.add_carbs || []), JSON.stringify(r.add_fiber || []),
        r.portion_grams || 300, r.sort_order || 0, r.is_published === true,
        JSON.stringify(r.auto_addons || {})
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
  fastify.put('/admin/recipes/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const r = req.body || {};
    // Support both: categories[] (new) and cat (legacy)
    const cats = Array.isArray(r.categories) && r.categories.length ? r.categories : (r.cat ? [r.cat] : []);
    const primaryCat = cats.length ? cats[0] : r.cat;
    const result = await db.query(
      `UPDATE recipes SET cat=$1, name=$2, emoji=$3, time_min=$4, difficulty=$5, servings=$6,
          is_free=$7, kcal=$8, protein=$9, fat=$10, carbs=$11, fiber=$12, tags=$13,
          photo=$14, img_position=$15, quote=$16, ingredients=$17, steps=$18, note=$19,
          vk_video=$20, yt_video=$21, dzen_video=$22, add_protein=$23, add_fat=$24, add_carbs=$25, add_fiber=$26,
          portion_grams=$27, sort_order=$28, is_published=$29, auto_addons=$30, updated_at=now()
       WHERE id=$31 RETURNING *`,
      [
        primaryCat, r.name, r.emoji || '🍴', r.time_min || 30, r.difficulty || 'easy',
        r.servings || 4, r.is_free || false,
        r.kcal || 0, r.protein || 0, r.fat || 0, r.carbs || 0, r.fiber || 0,
        r.tags || [], r.photo || null, r.img_position || null, r.quote || null,
        JSON.stringify(r.ingredients || []), JSON.stringify(r.steps || []),
        r.note || null, r.vk_video || null, r.yt_video || null, r.dzen_video || null,
        JSON.stringify(r.add_protein || []), JSON.stringify(r.add_fat || []),
        JSON.stringify(r.add_carbs || []), JSON.stringify(r.add_fiber || []),
        r.portion_grams || 300, r.sort_order || 0, r.is_published === true,
        JSON.stringify(r.auto_addons || {}), req.params.id
      ]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    // Update recipe_categories
    if (cats.length) {
      await db.query('DELETE FROM recipe_categories WHERE recipe_id = $1', [req.params.id]);
      for (const catId of cats) {
        await db.query('INSERT INTO recipe_categories (recipe_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, catId]);
      }
    }
    audit.log('recipe_update', { userId: req.user.sub, detail: 'recipe:' + req.params.id, ip: req.ip });
    result.rows[0].categories = cats;
    return result.rows[0];
  });

  // DELETE /admin/recipes/:id
  fastify.delete('/admin/recipes/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const result = await db.query('DELETE FROM recipes WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    audit.log('recipe_delete', { userId: req.user.sub, detail: 'recipe:' + req.params.id, ip: req.ip });
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — Categories
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /admin/categories — full list for admin (includes auto_addons)
  fastify.get('/admin/categories', { preHandler: [authenticate, requireAdmin] }, async () => {
    const result = await db.query('SELECT * FROM categories ORDER BY sort_order');
    return result.rows;
  });

  // POST /admin/categories — create category
  fastify.post('/admin/categories', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
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
  fastify.put('/admin/categories/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
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
  fastify.delete('/admin/categories/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const inUse = await db.query('SELECT COUNT(*)::int AS n FROM recipe_categories WHERE category_id=$1', [req.params.id]);
    if (inUse.rows[0].n > 0) return reply.status(409).send({ error: 'В категории есть рецепты (' + inUse.rows[0].n + '). Сначала удалите или перенесите.' });
    const result = await db.query('DELETE FROM categories WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    audit.log('category_delete', { userId: req.user.sub, detail: 'category:' + req.params.id, ip: req.ip });
    return { ok: true };
  });
}

module.exports = contentRoutes;
