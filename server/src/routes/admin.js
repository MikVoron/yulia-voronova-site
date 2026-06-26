const db = require('../db');
const { requireAdmin } = require('../middleware');
const { sendPaymentConfirmed, sendPaymentRejected, sendSubscriptionExtended, sendFeedbackReply } = require('../email');
const audit = require('../audit');

const CONFIRM_PAYMENT_MONTHS = new Set([1, 3, 6, 12]);
const PAYMENT_STATUSES = new Set(['pending', 'confirmed', 'rejected']);
const FEEDBACK_STATUSES = new Set(['waiting_admin', 'waiting_user', 'closed', 'new']);
const AUDIT_EVENTS = new Set([
  'login',
  'login_blocked',
  'register',
  'trial_granted',
  'trial_denied',
  'payment_submit',
  'payment_confirm',
  'payment_reject',
  'user_block',
  'user_unblock',
  'subscription_extend',
  'feedback_reply',
  'review_delete',
  'news_create',
  'news_update',
  'news_delete',
  'recipe_create',
  'recipe_update',
  'recipe_delete',
  'recipe_seasonal_set',
  'recipe_seasonal_clear',
  'ingredient_catalog_upsert',
  'category_create',
  'category_update',
  'category_delete',
]);
const ADMIN_READ_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };
const ADMIN_HEAVY_READ_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };
const ADMIN_LIST_LIMIT_MAX = 200;
const ADMIN_LIST_PAGE_MAX = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePaymentId(value) {
  const id = String(value || '').trim();
  if (UUID_RE.test(id)) return id;
  if (/^[1-9]\d*$/.test(id)) return id;
  return null;
}

function parseUserId(value) {
  const id = String(value || '').trim();
  if (UUID_RE.test(id)) return id;
  if (/^[1-9]\d*$/.test(id)) return id;
  return null;
}

function getQueryString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseListWindow(query, fallbackLimit, maxLimit = ADMIN_LIST_LIMIT_MAX) {
  const rawPage = parseInt(query.page, 10);
  const page = Math.min(ADMIN_LIST_PAGE_MAX, Math.max(1, Number.isFinite(rawPage) ? rawPage : 1));
  const rawLimit = parseInt(query.limit, 10);
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : fallbackLimit));
  return { page, limit, offset: (page - 1) * limit };
}

async function adminRoutes(fastify) {

  // GET /admin/users — список пользователей
  fastify.get('/admin/users', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_READ_RATE_LIMIT }
  }, async (req) => {
    const { limit, offset } = parseListWindow(req.query || {}, 200);
    const result = await db.query(
      'SELECT u.id, u.email, u.display_name, u.role, u.is_blocked, u.created_at, s.status as sub_status, s.trial_ends_at, s.active_until FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id ORDER BY u.created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  });

  // GET /admin/payments — все pending платежи
  fastify.get('/admin/payments', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_READ_RATE_LIMIT }
  }, async (req) => {
    const requestedStatus = getQueryString(req.query.status);
    const status = PAYMENT_STATUSES.has(requestedStatus) ? requestedStatus : 'pending';
    const { limit, offset } = parseListWindow(req.query || {}, 100);
    const result = await db.query(
      'SELECT p.id, p.user_id, p.amount, p.sender_name, p.payment_date, p.status, p.admin_comment, p.user_comment, p.created_at, p.updated_at, (p.screenshot IS NOT NULL) as has_screenshot, u.email FROM payments p JOIN users u ON u.id=p.user_id WHERE p.status=$1 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3',
      [status, limit, offset]
    );
    return result.rows;
  });

  // GET /admin/payments/:id/screenshot — получить скриншот платежа
  fastify.get('/admin/payments/:id/screenshot', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parsePaymentId(req.params.id);
    if (!id) return reply.status(400).send({ error: 'Некорректный id платежа' });
    const result = await db.query('SELECT screenshot FROM payments WHERE id=$1', [id]);
    if (!result.rows.length || !result.rows[0].screenshot) return reply.status(404).send({ error: 'Скриншот не найден' });
    return { screenshot: result.rows[0].screenshot };
  });

  // POST /admin/payments/:id/confirm — подтвердить оплату
  fastify.post('/admin/payments/:id/confirm', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parsePaymentId(req.params.id);
    if (!id) return reply.status(400).send({ error: 'Некорректный id платежа' });
    const { months, comment } = req.body || {};
    const normalizedMonths = months == null || months === '' ? 1 : Number(months);
    if (!CONFIRM_PAYMENT_MONTHS.has(normalizedMonths)) {
      return reply.status(400).send({ error: 'months: допустимы только 1, 3, 6 или 12' });
    }
    const days = normalizedMonths * 30;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      // Идемпотентно: только pending → confirmed
      const payment = await client.query(
        "UPDATE payments SET status='confirmed', admin_comment=$2, updated_at=now() WHERE id=$1 AND status='pending' RETURNING *",
        [id, comment || null]
      );
      if (!payment.rows.length) {
        await client.query('ROLLBACK');
        // Проверим, существует ли платёж вообще
        const exists = await db.query('SELECT status FROM payments WHERE id=$1', [id]);
        if (!exists.rows.length) return reply.status(404).send({ error: 'Платёж не найден' });
        return reply.status(409).send({ error: 'Платёж уже обработан (статус: ' + exists.rows[0].status + ')' });
      }
      const p = payment.rows[0];
      // UPSERT подписку: продлить существующую или создать новую
      const sub = await client.query('SELECT * FROM subscriptions WHERE user_id=$1', [p.user_id]);
      let newUntil;
      if (sub.rows.length) {
        const current = sub.rows[0];
        const baseDate = (current.status === 'active' && new Date(current.active_until) > new Date()) ? new Date(current.active_until) : new Date();
        newUntil = new Date(baseDate.getTime() + days * 86400000);
        await client.query("UPDATE subscriptions SET status='active', active_until=$2, updated_at=now() WHERE user_id=$1", [p.user_id, newUntil]);
      } else {
        newUntil = new Date(Date.now() + days * 86400000);
        await client.query(
          "INSERT INTO subscriptions (user_id, status, active_until) VALUES ($1, 'active', $2)",
          [p.user_id, newUntil]
        );
      }
      await client.query('COMMIT');
      // отправить email подтверждения (вне транзакции)
      const userRes = await db.query('SELECT email FROM users WHERE id=$1', [p.user_id]);
      const payEmail = userRes.rows.length ? userRes.rows[0].email : null;
      audit.log('payment_confirm', { userId: req.user.sub, email: payEmail, detail: 'payment#' + id + ' +' + days + 'd', ip: req.ip });
      if (payEmail) {
        sendPaymentConfirmed(payEmail, days, newUntil, comment || '').catch(e => fastify.log.error(e, 'Payment confirmed email error'));
      }
      return { ok: true, message: 'Подписка активирована на ' + days + ' дней' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // POST /admin/payments/:id/reject — отклонить платёж
  fastify.post('/admin/payments/:id/reject', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parsePaymentId(req.params.id);
    if (!id) return reply.status(400).send({ error: 'Некорректный id платежа' });
    const { comment } = req.body || {};
    const adminComment = String(comment || '').trim();
    if (!adminComment) {
      return reply.status(400).send({ error: 'Укажите причину отклонения платежа' });
    }
    const updated = await db.query(
      "UPDATE payments SET status='rejected', admin_comment=$2, updated_at=now() WHERE id=$1 AND status='pending' RETURNING user_id",
      [id, adminComment]
    );
    if (!updated.rows.length) {
      const exists = await db.query('SELECT status FROM payments WHERE id=$1', [id]);
      if (!exists.rows.length) return reply.status(404).send({ error: 'Платёж не найден' });
      return reply.status(409).send({ error: 'Платёж уже обработан (статус: ' + exists.rows[0].status + ')' });
    }
    const userRes = await db.query('SELECT email FROM users WHERE id=$1', [updated.rows[0].user_id]);
    const userEmail = userRes.rows.length ? userRes.rows[0].email : null;
    audit.log('payment_reject', { userId: req.user.sub, email: userEmail, detail: 'payment#' + id, ip: req.ip });
    if (userEmail) {
      sendPaymentRejected(userEmail, adminComment).catch(e => fastify.log.error(e, 'Payment rejected email error'));
    }
    return { ok: true };
  });

  // POST /admin/users/:id/block — заблокировать пользователя
  fastify.post('/admin/users/:id/block', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parseUserId(req.params.id);
    if (!id) return reply.status(400).send({ error: 'Некорректный id пользователя' });
    await db.query('UPDATE users SET is_blocked=true, updated_at=now() WHERE id=$1', [id]);
    await db.query("UPDATE subscriptions SET status='blocked', updated_at=now() WHERE user_id=$1", [id]);
    await db.query('DELETE FROM refresh_sessions WHERE user_id=$1', [id]);
    audit.log('user_block', { userId: req.user.sub, detail: 'blocked user#' + id, ip: req.ip });
    return { ok: true };
  });

  // POST /admin/users/:id/unblock — разблокировать
  fastify.post('/admin/users/:id/unblock', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parseUserId(req.params.id);
    if (!id) return reply.status(400).send({ error: 'Некорректный id пользователя' });
    await db.query('UPDATE users SET is_blocked=false, updated_at=now() WHERE id=$1', [id]);
    // Восстановить подписку: active_until в будущем → active, trial_ends_at в будущем → trial, иначе expired
    await db.query(`
      UPDATE subscriptions SET status = CASE
        WHEN active_until > now() THEN 'active'
        WHEN trial_ends_at > now() THEN 'trial'
        ELSE 'expired'
      END, updated_at = now()
      WHERE user_id = $1 AND status = 'blocked'
    `, [id]);
    audit.log('user_unblock', { userId: req.user.sub, detail: 'unblocked user#' + id, ip: req.ip });
    return { ok: true };
  });

  // POST /admin/users/:id/extend — продлить подписку вручную на N дней
  fastify.post('/admin/users/:id/extend', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parseUserId(req.params.id);
    if (!id) return reply.status(400).send({ error: 'Некорректный id пользователя' });
    const days = parseInt(req.body && req.body.days, 10);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return reply.status(400).send({ error: 'days: число от 1 до 3650' });
    }
    const userRes = await db.query('SELECT id, email, role FROM users WHERE id=$1', [id]);
    if (!userRes.rows.length) return reply.status(404).send({ error: 'Пользователь не найден' });
    if (userRes.rows[0].role === 'admin') return reply.status(400).send({ error: 'Нельзя продлить подписку администратора' });

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const sub = await client.query('SELECT * FROM subscriptions WHERE user_id=$1', [id]);
      let newUntil;
      if (sub.rows.length) {
        const current = sub.rows[0];
        const baseDate = (current.status === 'active' && current.active_until && new Date(current.active_until) > new Date())
          ? new Date(current.active_until)
          : new Date();
        newUntil = new Date(baseDate.getTime() + days * 86400000);
        await client.query("UPDATE subscriptions SET status='active', active_until=$2, updated_at=now() WHERE user_id=$1", [id, newUntil]);
      } else {
        newUntil = new Date(Date.now() + days * 86400000);
        await client.query(
          "INSERT INTO subscriptions (user_id, status, active_until) VALUES ($1, 'active', $2)",
          [id, newUntil]
        );
      }
      await client.query('COMMIT');
      audit.log('subscription_extend', { userId: req.user.sub, email: userRes.rows[0].email, detail: 'user#' + id + ' +' + days + 'd → ' + newUntil.toISOString(), ip: req.ip });
      // Email вне транзакции — не роняем ответ если SMTP упал
      if (userRes.rows[0].email) {
        sendSubscriptionExtended(userRes.rows[0].email, days, newUntil).catch(e => fastify.log.error(e, 'Subscription extended email error'));
      }
      return { ok: true, active_until: newUntil.toISOString(), message: 'Подписка продлена на ' + days + ' дн.' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // GET /admin/feedback — обращения с пагинацией и тредами
  // Сортировка: waiting_admin/new сверху, дальше по updated_at DESC.
  fastify.get('/admin/feedback', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_HEAVY_READ_RATE_LIMIT }
  }, async (req, reply) => {
    const { page, limit, offset } = parseListWindow(req.query || {}, 20, 100);
    const status = getQueryString(req.query.status);
    if (status && !FEEDBACK_STATUSES.has(status)) {
      return reply.status(400).send({ error: 'Некорректный статус обращения' });
    }

    // Совместимость с legacy 'new': при фильтре waiting_admin включаем оба статуса,
    // иначе бейдж и список рассинхронизируются, пока в БД ещё могут оставаться 'new'.
    let where = '';
    const params = [];
    if (status === 'waiting_admin') {
      where = " WHERE f.status IN ('waiting_admin','new')";
    } else if (status) {
      params.push(status);
      where = ' WHERE f.status=$' + params.length;
    }

    const countResult = await db.query(
      'SELECT COUNT(*) FROM feedback_messages f' + where, params
    );
    const total = parseInt(countResult.rows[0].count);

    // Счётчик «требует ответа» для бейджа (включая legacy 'new')
    const pendingCountResult = await db.query(
      "SELECT COUNT(*) FROM feedback_messages WHERE status IN ('waiting_admin','new')"
    );
    const totalNew = parseInt(pendingCountResult.rows[0].count);

    params.push(limit);
    params.push(offset);
    const result = await db.query(
      `SELECT f.id, f.user_id, f.category, f.status, f.created_at, f.updated_at, f.user_deleted_at,
              u.email, u.display_name,
              (SELECT COUNT(*) FROM feedback_thread_messages WHERE feedback_id = f.id) AS msg_count
         FROM feedback_messages f
         JOIN users u ON u.id = f.user_id${where}
         ORDER BY CASE WHEN f.status IN ('waiting_admin','new') THEN 0 ELSE 1 END,
                  f.updated_at DESC, f.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const ids = result.rows.map(r => r.id);
    const byThread = new Map();
    if (ids.length) {
      const msgs = await db.query(
        `SELECT id, feedback_id, sender_type, sender_id, text, seen_at, created_at
           FROM feedback_thread_messages
          WHERE feedback_id = ANY($1::int[])
          ORDER BY created_at ASC, id ASC`,
        [ids]
      );
      for (const m of msgs.rows) {
        if (!byThread.has(m.feedback_id)) byThread.set(m.feedback_id, []);
        byThread.get(m.feedback_id).push({
          id: m.id,
          sender_type: m.sender_type,
          sender_id: m.sender_id,
          text: m.text,
          seen_at: m.seen_at,
          created_at: m.created_at,
        });
      }
    }
    const rows = result.rows.map(r => ({
      ...r,
      msg_count: Number(r.msg_count) || 0,
      messages: byThread.get(r.id) || [],
    }));
    return { rows, total, totalNew, page, limit, hasMore: offset + rows.length < total };
  });

  // POST /admin/feedback/:id/reply — ответ Юлии (добавляет сообщение в тред)
  fastify.post('/admin/feedback/:id/reply', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Некорректный id' });
    const { reply: replyText } = req.body || {};
    if (!replyText || !replyText.trim()) return reply.status(400).send({ error: 'Введите текст ответа' });
    if (replyText.length > 5000) return reply.status(400).send({ error: 'Слишком длинный ответ' });
    const trimmed = replyText.trim();

    const client = await db.pool.connect();
    let head;
    try {
      await client.query('BEGIN');
      const headRes = await client.query(
        `SELECT id, user_id, category, status FROM feedback_messages WHERE id=$1 FOR UPDATE`,
        [id]
      );
      if (!headRes.rows.length) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ error: 'Обращение не найдено' });
      }
      head = headRes.rows[0];
      if (head.status === 'closed') {
        await client.query('ROLLBACK');
        return reply.status(409).send({ error: 'Обращение закрыто пользователем. Ответить нельзя.' });
      }
      await client.query(
        `INSERT INTO feedback_thread_messages (feedback_id, sender_type, sender_id, text)
         VALUES ($1, 'admin', $2, $3)`,
        [id, req.user.sub, trimmed]
      );
      await client.query(
        `UPDATE feedback_messages
            SET status='waiting_user', updated_at=now()
          WHERE id=$1`,
        [id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Первое сообщение пользователя — для контекста в письме
    const firstUserMsg = await db.query(
      `SELECT text FROM feedback_thread_messages
        WHERE feedback_id=$1 AND sender_type='user'
        ORDER BY created_at ASC, id ASC LIMIT 1`,
      [id]
    );
    const userRow = await db.query('SELECT email, display_name FROM users WHERE id=$1', [head.user_id]);
    const userEmail = userRow.rows[0]?.email;
    if (userEmail) {
      sendFeedbackReply(userEmail, head.category, firstUserMsg.rows[0]?.text || '', trimmed, userRow.rows[0]?.display_name)
        .catch(e => fastify.log.error(e, 'Feedback reply email error'));
    }
    audit.log('feedback_reply', { userId: req.user.sub, detail: 'feedback#' + id, ip: req.ip });
    return { ok: true };
  });

  // GET /admin/audit — аудит-лог с пагинацией
  fastify.get('/admin/audit', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_HEAVY_READ_RATE_LIMIT }
  }, async (req, reply) => {
    const { page, limit, offset } = parseListWindow(req.query || {}, 50, 200);
    const event = getQueryString(req.query.event);
    if (event && !AUDIT_EVENTS.has(event)) {
      return reply.status(400).send({ error: 'Некорректный тип события аудита' });
    }

    let where = '';
    const params = [];
    if (event) {
      params.push(event);
      where = ' WHERE event=$' + params.length;
    }

    const countResult = await db.query(
      'SELECT COUNT(*) FROM audit_log' + where, params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limit);
    params.push(offset);
    const result = await db.query(
      `SELECT id, user_id, email, event, detail, ip, created_at FROM audit_log${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows: result.rows, total, page, limit, hasMore: offset + result.rows.length < total };
  });

  // GET /admin/stats — базовая статистика
  fastify.get('/admin/stats', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_READ_RATE_LIMIT }
  }, async () => {
    const users = await db.query("SELECT COUNT(*) FROM users WHERE role != 'admin'");
    const trials = await db.query("SELECT COUNT(*) FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status='trial' AND u.role != 'admin'");
    const active = await db.query("SELECT COUNT(*) FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status='active' AND u.role != 'admin'");
    const expired = await db.query("SELECT COUNT(*) FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status='expired' AND u.role != 'admin'");
    const blocked = await db.query("SELECT COUNT(*) FROM users WHERE is_blocked = true AND role != 'admin'");
    const pendingPayments = await db.query("SELECT COUNT(*) FROM payments WHERE status='pending'");
    return {
      totalUsers: Number(users.rows[0].count),
      trials: Number(trials.rows[0].count),
      active: Number(active.rows[0].count),
      expired: Number(expired.rows[0].count),
      blocked: Number(blocked.rows[0].count),
      pendingPayments: Number(pendingPayments.rows[0].count)
    };
  });
}

module.exports = adminRoutes;
