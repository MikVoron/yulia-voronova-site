const db = require('../db');
const { authenticate } = require('../middleware');

async function favoritesRoutes(fastify) {

  // GET /favorites — list user's favorite recipe ids
  fastify.get('/favorites', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT recipe_id FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.sub]
    );
    return result.rows.map(r => r.recipe_id);
  });

  // POST /favorites/toggle — add or remove a favorite, return new state
  fastify.post('/favorites/toggle', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { recipe_id } = req.body || {};
    if (!recipe_id || typeof recipe_id !== 'string') {
      return reply.status(400).send({ error: 'recipe_id обязателен' });
    }

    // Check if already favorited
    const existing = await db.query(
      'SELECT 1 FROM user_favorites WHERE user_id = $1 AND recipe_id = $2',
      [req.user.sub, recipe_id]
    );

    if (existing.rows.length) {
      await db.query(
        'DELETE FROM user_favorites WHERE user_id = $1 AND recipe_id = $2',
        [req.user.sub, recipe_id]
      );
      return { recipe_id, favorited: false };
    } else {
      await db.query(
        'INSERT INTO user_favorites (user_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.user.sub, recipe_id]
      );
      return { recipe_id, favorited: true };
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
    // Limit to 500 favorites
    const safeIds = ids.filter(id => typeof id === 'string').slice(0, 500);

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
