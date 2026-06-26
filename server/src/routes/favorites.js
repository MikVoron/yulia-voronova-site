const db = require('../db');
const { authenticate } = require('../middleware');

const FAVORITES_MAX = 500;
const RECIPE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,98}[a-z0-9]$/i;

function normalizeRecipeId(value) {
  const id = String(value || '').trim();
  return RECIPE_ID_RE.test(id) ? id : null;
}

async function pruneOldFavorites(userId) {
  await db.query(
    `DELETE FROM user_favorites
      WHERE user_id = $1
        AND recipe_id IN (
          SELECT recipe_id FROM user_favorites
           WHERE user_id = $1
           ORDER BY created_at DESC, recipe_id DESC
           OFFSET $2
        )`,
    [userId, FAVORITES_MAX]
  );
}

async function favoritesRoutes(fastify) {

  // GET /favorites — list user's favorite recipe ids
  fastify.get('/favorites', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT recipe_id FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [req.user.sub, FAVORITES_MAX]
    );
    return result.rows.map(r => r.recipe_id);
  });

  // POST /favorites/toggle — add or remove a favorite, return new state
  fastify.post('/favorites/toggle', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { recipe_id } = req.body || {};
    const recipeId = normalizeRecipeId(recipe_id);
    if (!recipeId) {
      return reply.status(400).send({ error: 'recipe_id обязателен' });
    }

    // Check if already favorited
    const existing = await db.query(
      'SELECT 1 FROM user_favorites WHERE user_id = $1 AND recipe_id = $2',
      [req.user.sub, recipeId]
    );

    if (existing.rows.length) {
      await db.query(
        'DELETE FROM user_favorites WHERE user_id = $1 AND recipe_id = $2',
        [req.user.sub, recipeId]
      );
      return { recipe_id: recipeId, favorited: false };
    } else {
      await db.query(
        'INSERT INTO user_favorites (user_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.user.sub, recipeId]
      );
      await pruneOldFavorites(req.user.sub);
      return { recipe_id: recipeId, favorited: true };
    }
  });

  // PUT /favorites/sync — bulk sync: client sends full list, server replaces
  fastify.put('/favorites/sync', {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids)) {
      return reply.status(400).send({ error: 'ids должен быть массивом' });
    }
    if (ids.length > FAVORITES_MAX) {
      return reply.status(400).send({ error: 'Слишком много избранных рецептов (макс. ' + FAVORITES_MAX + ')' });
    }
    const safeIds = [];
    for (const id of ids) {
      const recipeId = normalizeRecipeId(id);
      if (!recipeId) return reply.status(400).send({ error: 'Некорректный recipe_id' });
      if (!safeIds.includes(recipeId)) safeIds.push(recipeId);
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_favorites WHERE user_id = $1', [req.user.sub]);
      for (let i = 0; i < safeIds.length; i++) {
        await client.query(
          'INSERT INTO user_favorites (user_id, recipe_id, created_at) VALUES ($1, $2, now() - $3 * interval \'1 second\') ON CONFLICT DO NOTHING',
          [req.user.sub, safeIds[i], i]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return { synced: safeIds.length };
  });
}

module.exports = favoritesRoutes;
