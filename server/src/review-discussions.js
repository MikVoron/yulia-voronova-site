const db = require('./db');
const { authenticate } = require('./middleware');
const { reviewAvatar, assignReviewAvatar } = require('./review-avatars');
const audit = require('./audit');

const PAGE_SIZE = 20;
const INITIAL_PAGE_SIZE = 5;
const fields = `c.id, c.review_id, c.user_id, c.text, c.created_at, c.updated_at,
  u.display_name, u.avatar, u.role, ra.position AS review_avatar_position`;
const authors = `JOIN users u ON u.id=c.user_id
  LEFT JOIN review_avatar_assignments ra ON ra.user_id=c.user_id`;

function publicComment(row) {
  return {
    id: row.id, userId: row.user_id, text: row.text,
    createdAt: row.created_at, updatedAt: row.updated_at,
    author: row.display_name?.trim() || 'Аноним', avatar: reviewAvatar(row),
    isAuthor: row.role === 'admin',
  };
}

// Bounded first page for every visible review in one query, including empty threads.
async function discussionSummaries(reviewIds) {
  if (!reviewIds.length) return new Map();
  const result = await db.query(
    `SELECT r.id AS review_id,
       (SELECT COUNT(*)::int FROM review_comments c WHERE c.review_id=r.id) AS comment_count,
       COALESCE((SELECT json_agg(page ORDER BY page.id) FROM (
         SELECT ${fields} FROM review_comments c ${authors}
         WHERE c.review_id=r.id ORDER BY c.id LIMIT $2
       ) page), '[]'::json) AS comments
     FROM reviews r WHERE r.id=ANY($1::int[])`, [reviewIds, INITIAL_PAGE_SIZE]
  );
  return new Map(result.rows.map(row => [row.review_id, {
    comments: row.comments.map(publicComment), commentCount: Number(row.comment_count),
  }]));
}

function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= 2147483647 ? number : null;
}

function commentText(body) {
  return typeof body?.text === 'string' ? body.text.trim() : '';
}

function registerDiscussionRoutes(fastify) {
  fastify.get('/content/reviews/:id/comments', async (req, reply) => {
    const id = positiveId(req.params.id);
    const after = req.query.after === undefined || req.query.after === '0' ? 0 : positiveId(req.query.after);
    if (!id || after === null) return reply.code(400).send({ error: 'Некорректный адрес обсуждения' });
    const review = await db.query('SELECT id FROM reviews WHERE id=$1', [id]);
    if (!review.rows.length) return reply.code(404).send({ error: 'Отзыв не найден' });
    const result = await db.query(
      `SELECT ${fields} FROM review_comments c ${authors}
       WHERE c.review_id=$1 AND c.id>$2 ORDER BY c.id LIMIT $3`, [id, after, PAGE_SIZE + 1]
    );
    const comments = result.rows.slice(0, PAGE_SIZE).map(publicComment);
    return { comments, hasMore: result.rows.length > PAGE_SIZE };
  });

  fastify.post('/content/reviews/:id/comments', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const id = positiveId(req.params.id);
    const text = commentText(req.body);
    const requestId = req.body?.requestId;
    if (!id) return reply.code(400).send({ error: 'Некорректный отзыв' });
    if (!text || text.length > 1000) return reply.code(400).send({ error: 'Напишите сообщение: от 1 до 1000 символов' });
    if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return reply.code(400).send({ error: 'Некорректный идентификатор сообщения' });
    }
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const review = await client.query('SELECT id FROM reviews WHERE id=$1 FOR KEY SHARE', [id]);
      if (!review.rows.length) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Отзыв не найден' });
      }
      const inserted = await client.query(
        `INSERT INTO review_comments (review_id, user_id, request_id, text)
         VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, request_id) DO NOTHING RETURNING id`,
        [id, req.user.sub, requestId, text]
      );
      const existing = await client.query(
        'SELECT id, review_id, text FROM review_comments WHERE user_id=$1 AND request_id=$2',
        [req.user.sub, requestId]
      );
      const row = existing.rows[0];
      if (!row || row.review_id !== id || row.text !== text) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Это сообщение уже отправлено. Обновите обсуждение.' });
      }
      await assignReviewAvatar(client, req.user.sub);
      const saved = await client.query(
        `SELECT ${fields} FROM review_comments c ${authors} WHERE c.id=$1`, [row.id]
      );
      await client.query('COMMIT');
      return reply.code(inserted.rows.length ? 201 : 200).send({ comment: publicComment(saved.rows[0]) });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });

  fastify.patch('/content/review-comments/:id', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const id = positiveId(req.params.id);
    const text = commentText(req.body);
    if (!id || !text || text.length > 1000) return reply.code(400).send({ error: 'Напишите сообщение: от 1 до 1000 символов' });
    const result = await db.query(
      `UPDATE review_comments SET text=$3, updated_at=now()
       WHERE id=$1 AND user_id=$2 RETURNING id`, [id, req.user.sub, text]
    );
    if (!result.rows.length) return reply.code(404).send({ error: 'Сообщение не найдено' });
    return { ok: true };
  });

  fastify.delete('/content/review-comments/:id', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const id = positiveId(req.params.id);
    if (!id) return reply.code(400).send({ error: 'Некорректное сообщение' });
    const result = await db.query(
      `DELETE FROM review_comments WHERE id=$1 AND
       (user_id=$2 OR EXISTS(SELECT 1 FROM users WHERE id=$2 AND role='admin')) RETURNING id`,
      [id, req.user.sub]
    );
    if (!result.rows.length) return reply.code(404).send({ error: 'Сообщение не найдено' });
    await audit.log('review_comment_delete', { userId: req.user.sub, detail: 'comment#' + id, ip: req.ip });
    return { ok: true };
  });
}

module.exports = { registerDiscussionRoutes, discussionSummaries, publicComment };
