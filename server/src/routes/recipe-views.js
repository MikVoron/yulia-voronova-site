const db = require('../db');
const { authenticate, requireAdmin, getUserTier, userCanSeeRecipe } = require('../middleware');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECIPE_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/i;
const BOT_RE = /bot\b|crawler|spider|slurp|facebookexternalhit|headless/i;
// The owner's personal account may keep a regular user role. Support the
// supplied comma spelling and its likely dot spelling without changing access.
const EXCLUDED_VIEW_EMAILS = ['voronova,yulia@gmail.com', 'voronova.yulia@gmail.com'];

// Each aggregate is computed independently. A visitor who opens both modes
// counts once in unique_visitors, and once in each mode's visitor column.
const REPORT_SQL = `
  WITH views AS (
    SELECT v.*, COALESCE('u:' || v.user_id::text, 'g:' || v.visitor_id::text) AS viewer
    FROM recipe_views v
    LEFT JOIN users u ON u.id = v.user_id
    WHERE ($1::int IS NULL OR v.created_at >= now() - make_interval(days => $1::int))
      AND (v.user_id IS NULL OR (u.role <> 'admin'
        AND lower(trim(u.email)) <> ALL($2::text[])))
  ), counts AS (
    SELECT recipe_id, COUNT(*)::int AS openings,
      COUNT(DISTINCT viewer)::int AS unique_visitors,
      COUNT(*) FILTER (WHERE view_mode = 'full')::int AS full_openings,
      COUNT(DISTINCT viewer) FILTER (WHERE view_mode = 'full')::int AS full_visitors,
      COUNT(*) FILTER (WHERE view_mode = 'preview')::int AS preview_openings,
      COUNT(DISTINCT viewer) FILTER (WHERE view_mode = 'preview')::int AS preview_visitors
    FROM views GROUP BY recipe_id
  ), favorites AS (
    SELECT f.recipe_id, COUNT(*)::int AS favorites
    FROM user_favorites f JOIN users u ON u.id = f.user_id
    WHERE u.role <> 'admin' GROUP BY f.recipe_id
  ), reviews_count AS (
    SELECT r.recipe_id, COUNT(*)::int AS reviews
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE u.role <> 'admin' GROUP BY r.recipe_id
  )
  SELECT r.id, r.name, COALESCE(c.openings, 0) AS openings,
    COALESCE(c.unique_visitors, 0) AS unique_visitors,
    COALESCE(c.full_openings, 0) AS full_openings,
    COALESCE(c.full_visitors, 0) AS full_visitors,
    COALESCE(c.preview_openings, 0) AS preview_openings,
    COALESCE(c.preview_visitors, 0) AS preview_visitors,
    COALESCE(f.favorites, 0) AS favorites, COALESCE(rc.reviews, 0) AS reviews
  FROM recipes r
  LEFT JOIN counts c ON c.recipe_id = r.id
  LEFT JOIN favorites f ON f.recipe_id = r.id
  LEFT JOIN reviews_count rc ON rc.recipe_id = r.id
  WHERE r.is_published = true
  ORDER BY unique_visitors DESC, openings DESC, r.name, r.id`;

async function recipeViewsRoutes(fastify) {
  fastify.post('/content/recipe-views', {
    bodyLimit: 1024,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    // Invalid/expired tokens must not silently turn an admin into a guest.
    preHandler: async (req, reply) => {
      if (req.headers.authorization) await authenticate(req, reply);
    }
  }, async (req, reply) => {
    const body = req.body || {};
    if (typeof body.recipe_id !== 'string' || !RECIPE_RE.test(body.recipe_id)
      || typeof body.event_id !== 'string' || !UUID_RE.test(body.event_id)
      || !['full', 'preview'].includes(body.view_mode)
      || (!req.user && (typeof body.visitor_id !== 'string' || !UUID_RE.test(body.visitor_id)))) {
      return reply.code(400).send({ error: 'Некорректные данные просмотра' });
    }
    if (BOT_RE.test(req.headers['user-agent'] || '')) return reply.code(204).send();
    if (req.user) {
      const account = await db.query('SELECT email FROM users WHERE id=$1', [req.user.sub]);
      const accountEmail = String(account.rows[0]?.email || '').trim().toLowerCase();
      if (EXCLUDED_VIEW_EMAILS.includes(accountEmail)) return reply.code(204).send();
    }
    const tier = await getUserTier(req.user?.sub);
    if (tier === 'admin') return reply.code(204).send();
    const result = await db.query(
      'SELECT id, access_level, is_free FROM recipes WHERE id=$1 AND is_published=true',
      [body.recipe_id]
    );
    const recipe = result.rows[0];
    if (!recipe) return reply.code(404).send({ error: 'Рецепт не найден' });
    const mode = userCanSeeRecipe(tier, recipe.access_level || (recipe.is_free ? 'free' : 'pro'))
      ? 'full' : 'preview';
    // Ignore stale frontend/access state rather than mislabel the viewed content.
    if (mode !== body.view_mode) return reply.code(204).send();
    await db.query(
      `INSERT INTO recipe_views (event_id, recipe_id, user_id, visitor_id, view_mode)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING`,
      [body.event_id, recipe.id, req.user?.sub || null, req.user ? null : body.visitor_id, mode]
    );
    return reply.code(204).send();
  });

  fastify.get('/admin/recipe-views', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const period = req.query.period || '30';
    if (!['7', '30', 'all'].includes(period)) {
      return reply.code(400).send({ error: 'Допустимые периоды: 7, 30, all' });
    }
    reply.header('Cache-Control', 'no-store');
    const rows = await db.query(REPORT_SQL, [period === 'all' ? null : Number(period), EXCLUDED_VIEW_EMAILS]);
    const first = await db.query(
      `SELECT MIN(v.created_at) AS first_recorded_at FROM recipe_views v
       LEFT JOIN users u ON u.id = v.user_id
       WHERE v.user_id IS NULL OR (u.role <> 'admin'
         AND lower(trim(u.email)) <> ALL($1::text[]))`,
      [EXCLUDED_VIEW_EMAILS]
    );
    return { period, firstRecordedAt: first.rows[0]?.first_recorded_at || null, recipes: rows.rows };
  });
}

module.exports = recipeViewsRoutes;
