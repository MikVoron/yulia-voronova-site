'use strict';
const db = require('./db');
const email = require('./email');
const { authenticate } = require('./middleware');

const targets = {
  review: { column: 'review_id', table: 'reviews', key: 'id', owner: 't.user_id', join: 'JOIN recipes r ON r.id=t.recipe_id' },
  comment: { column: 'comment_id', table: 'review_comments', key: 'id', owner: 't.user_id', join: 'JOIN reviews rv ON rv.id=t.review_id JOIN recipes r ON r.id=rv.recipe_id' },
  reply: { column: 'reply_id', table: 'review_replies', key: 'review_id', owner: 't.admin_id', join: 'JOIN reviews rv ON rv.id=t.review_id JOIN recipes r ON r.id=rv.recipe_id' },
};
function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
function likeFields(type, id, userParam) {
  const column = targets[type].column;
  return `(SELECT COUNT(*)::int FROM review_likes l WHERE l.${column}=${id} AND l.active) AS like_count,
    EXISTS(SELECT 1 FROM review_likes l WHERE l.${column}=${id} AND l.user_id=${userParam} AND l.active) AS liked_by_user`;
}
function publicLikes(row) {
  return { likeCount: Number(row.like_count) || 0, likedByCurrentUser: row.liked_by_user === true };
}

function registerLikeRoutes(fastify) {
  // PUT sets the desired state. A retried network request cannot toggle it twice.
  fastify.put('/content/review-likes/:type/:id', {
    preHandler: [authenticate], config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const target = targets[req.params.type];
    const id = positiveId(req.params.id), active = req.body?.active;
    if (!Object.hasOwn(targets, req.params.type) || !id || typeof active !== 'boolean') {
      return reply.code(400).send({ error: 'Некорректный лайк' });
    }
    const client = await db.pool.connect();
    let notificationId, result;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [req.user.sub + ':' + req.params.type + ':' + id]);
      const found = await client.query(
        `SELECT ${target.owner} AS owner_id FROM ${target.table} t ${target.join}
         WHERE t.${target.key}=$1 AND r.is_published=true FOR KEY SHARE OF t`, [id]);
      if (!found.rows.length) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Отзыв или ответ не найден' });
      }
      if (active) {
        const inserted = await client.query(
          `INSERT INTO review_likes(user_id, ${target.column}) VALUES ($1,$2)
           ON CONFLICT (user_id, ${target.column}) DO NOTHING RETURNING id`, [req.user.sub, id]);
        await client.query(`UPDATE review_likes SET active=true WHERE user_id=$1 AND ${target.column}=$2`, [req.user.sub, id]);
        const owner = found.rows[0].owner_id;
        if (inserted.rows.length && owner && owner !== req.user.sub) {
          const notification = await client.query(
            `INSERT INTO review_like_notifications(like_id,user_id)
             SELECT $1,id FROM users WHERE id=$2 AND notify_review_likes AND NOT is_blocked RETURNING id`,
            [inserted.rows[0].id, owner]);
          notificationId = notification.rows[0]?.id;
        }
      } else {
        await client.query(`UPDATE review_likes SET active=false WHERE user_id=$1 AND ${target.column}=$2`, [req.user.sub, id]);
      }
      result = await client.query(`SELECT ${likeFields(req.params.type, '$1', '$2::uuid')}`, [id, req.user.sub]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    if (notificationId) {
      // Claim once and recheck preferences after commit. Email errors never undo a like.
      try {
        const claimed = await db.query(
          `UPDATE review_like_notifications n SET email_claimed_at=now() FROM users u
           WHERE n.id=$1 AND n.user_id=u.id AND n.email_claimed_at IS NULL
             AND u.notify_review_likes AND u.email_review_likes AND NOT u.is_blocked
           RETURNING u.email`, [notificationId]);
        if (claimed.rows.length) {
          const recipe = await db.query(`SELECT r.id, r.name, ${req.params.type === 'review' ? 't.id' : 't.review_id'} AS review_id FROM ${target.table} t ${target.join} WHERE t.${target.key}=$1`, [id]);
          if (recipe.rows.length) await email.sendReviewLike(claimed.rows[0].email, recipe.rows[0].name, recipe.rows[0].id, req.params.type, recipe.rows[0].review_id);
        }
      } catch (error) { fastify.log.error({ err: error, notificationId }, 'Review like email failed'); }
    }
    return publicLikes(result.rows[0]);
  });

  fastify.get('/auth/review-like-settings', { preHandler: [authenticate] }, async req => {
    const result = await db.query('SELECT notify_review_likes AS enabled, email_review_likes AS email FROM users WHERE id=$1', [req.user.sub]);
    return result.rows[0];
  });
  fastify.put('/auth/review-like-settings', { preHandler: [authenticate] }, async (req, reply) => {
    const { enabled, email: mail } = req.body || {};
    if (typeof enabled !== 'boolean' || typeof mail !== 'boolean') return reply.code(400).send({ error: 'Некорректные настройки уведомлений' });
    await db.query('UPDATE users SET notify_review_likes=$2, email_review_likes=$3 WHERE id=$1', [req.user.sub, enabled, mail]);
    return { enabled, email: mail };
  });
  fastify.get('/content/review-like-notifications', { preHandler: [authenticate] }, async req => {
    const all = req.query.all === '1' && req.query.unread === 'true';
    const before = req.query.before === undefined ? null : positiveId(req.query.before);
    if (req.query.before !== undefined && !before) return { items: [], hasMore: false };
    const result = await db.query(
      `SELECT n.id, n.created_at, n.read_at, a.display_name AS actor,
              COALESCE(rv.recipe_id, cr.recipe_id, rr.recipe_id) AS recipe_id,
              COALESCE(rv.id, cr.id, rr.id) AS review_id,
              l.comment_id, l.reply_id, r.name AS recipe_name
       FROM review_like_notifications n JOIN review_likes l ON l.id=n.like_id AND l.active
       JOIN users u ON u.id=n.user_id AND u.notify_review_likes
       JOIN users a ON a.id=l.user_id AND NOT a.is_blocked
       LEFT JOIN reviews rv ON rv.id=l.review_id
       LEFT JOIN review_comments c ON c.id=l.comment_id LEFT JOIN reviews cr ON cr.id=c.review_id
       LEFT JOIN review_replies rp ON rp.review_id=l.reply_id LEFT JOIN reviews rr ON rr.id=rp.review_id
       JOIN recipes r ON r.id=COALESCE(rv.recipe_id, cr.recipe_id, rr.recipe_id) AND r.is_published
       WHERE n.user_id=$1 AND ($2::bigint IS NULL OR n.id<$2) AND (NOT $3::boolean OR n.read_at IS NULL)
       ORDER BY n.id DESC${all ? '' : ' LIMIT 21'}`, [req.user.sub, before, req.query.unread === 'true']);
    return { items: all ? result.rows : result.rows.slice(0, 20), hasMore: !all && result.rows.length > 20 };
  });
  fastify.post('/content/review-like-notifications/read', { preHandler: [authenticate] }, async (req, reply) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => !positiveId(id))) {
      return reply.code(400).send({ error: 'Некорректный список уведомлений' });
    }
    await db.query('UPDATE review_like_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND id=ANY($2::bigint[])', [req.user.sub, [...new Set(ids.map(Number))]]);
    return { ok: true };
  });
  fastify.post('/content/review-like-notifications/:id/read', { preHandler: [authenticate] }, async (req, reply) => {
    const id = positiveId(req.params.id);
    if (!id) return reply.code(400).send({ error: 'Некорректное уведомление' });
    const result = await db.query('UPDATE review_like_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id', [id, req.user.sub]);
    if (!result.rows.length) return reply.code(404).send({ error: 'Уведомление не найдено' });
    return { ok: true };
  });
}
module.exports = { registerLikeRoutes, likeFields, publicLikes };
