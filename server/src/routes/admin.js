const db = require('../db');
const { requireAdmin } = require('../middleware');
const { sendPaymentConfirmed, sendFeedbackReply } = require('../email');
const audit = require('../audit');

async function adminRoutes(fastify) {

  // GET /admin/users — список пользователей
  fastify.get('/admin/users', { preHandler: requireAdmin }, async (req) => {
    const result = await db.query(
      'SELECT u.id, u.email, u.display_name, u.role, u.is_blocked, u.created_at, s.status as sub_status, s.trial_ends_at, s.active_until FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id ORDER BY u.created_at DESC'
    );
    return result.rows;
  });

  // GET /admin/payments — все pending платежи
  fastify.get('/admin/payments', { preHandler: requireAdmin }, async (req) => {
    const status = req.query.status || 'pending';
    const result = await db.query(
      'SELECT p.id, p.user_id, p.amount, p.sender_name, p.payment_date, p.status, p.admin_comment, p.user_comment, p.created_at, p.updated_at, (p.screenshot IS NOT NULL) as has_screenshot, u.email FROM payments p JOIN users u ON u.id=p.user_id WHERE p.status=$1 ORDER BY p.created_at DESC',
      [status]
    );
    return result.rows;
  });

  // GET /admin/payments/:id/screenshot — получить скриншот платежа
  fastify.get('/admin/payments/:id/screenshot', { preHandler: requireAdmin }, async (req, reply) => {
    const result = await db.query('SELECT screenshot FROM payments WHERE id=$1', [req.params.id]);
    if (!result.rows.length || !result.rows[0].screenshot) return reply.status(404).send({ error: 'Скриншот не найден' });
    return { screenshot: result.rows[0].screenshot };
  });

  // POST /admin/payments/:id/confirm — подтвердить оплату
  fastify.post('/admin/payments/:id/confirm', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params;
    const { months, comment } = req.body || {};
    const days = (months || 1) * 30;
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
      if (sub.rows.length) {
        const current = sub.rows[0];
        const baseDate = (current.status === 'active' && new Date(current.active_until) > new Date()) ? new Date(current.active_until) : new Date();
        const newUntil = new Date(baseDate.getTime() + days * 86400000);
        await client.query("UPDATE subscriptions SET status='active', active_until=$2, updated_at=now() WHERE user_id=$1", [p.user_id, newUntil]);
      } else {
        const newUntil = new Date(Date.now() + days * 86400000);
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
        sendPaymentConfirmed(payEmail, days).catch(e => fastify.log.error(e, 'Payment confirmed email error'));
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
  fastify.post('/admin/payments/:id/reject', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params;
    const { comment } = req.body || {};
    await db.query("UPDATE payments SET status='rejected', admin_comment=$2, updated_at=now() WHERE id=$1", [id, comment || 'Отклонено']);
    audit.log('payment_reject', { userId: req.user.sub, detail: 'payment#' + id, ip: req.ip });
    return { ok: true };
  });

  // POST /admin/users/:id/block — заблокировать пользователя
  fastify.post('/admin/users/:id/block', { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params;
    await db.query('UPDATE users SET is_blocked=true, updated_at=now() WHERE id=$1', [id]);
    await db.query("UPDATE subscriptions SET status='blocked', updated_at=now() WHERE user_id=$1", [id]);
    await db.query('DELETE FROM refresh_sessions WHERE user_id=$1', [id]);
    audit.log('user_block', { userId: req.user.sub, detail: 'blocked user#' + id, ip: req.ip });
    return { ok: true };
  });

  // POST /admin/users/:id/unblock — разблокировать
  fastify.post('/admin/users/:id/unblock', { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params;
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

  // GET /admin/feedback — все обращения
  fastify.get('/admin/feedback', { preHandler: requireAdmin }, async () => {
    const result = await db.query(
      `SELECT f.id, f.user_id, f.category, f.text, f.status, f.admin_reply, f.admin_replied_at, f.created_at, u.email
       FROM feedback_messages f JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at DESC`
    );
    return result.rows;
  });

  // POST /admin/feedback/:id/reply — ответ админа на обращение
  fastify.post('/admin/feedback/:id/reply', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params;
    const { reply: replyText } = req.body || {};
    if (!replyText || !replyText.trim()) return reply.status(400).send({ error: 'Введите текст ответа' });
    if (replyText.length > 5000) return reply.status(400).send({ error: 'Слишком длинный ответ' });
    const result = await db.query(
      `UPDATE feedback_messages SET admin_reply=$2, admin_replied_at=now(), admin_id=$3, status='answered', updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, replyText.trim(), req.user.sub]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Обращение не найдено' });
    // Email пользователю
    const userRow = await db.query('SELECT email FROM users WHERE id=$1', [result.rows[0].user_id]);
    const userEmail = userRow.rows[0]?.email;
    if (userEmail) {
      sendFeedbackReply(userEmail, result.rows[0].category, result.rows[0].text, replyText.trim())
        .catch(e => fastify.log.error(e, 'Feedback reply email error'));
    }
    audit.log('feedback_reply', { userId: req.user.sub, detail: 'feedback#' + id, ip: req.ip });
    return { ok: true };
  });

  // GET /admin/audit — аудит-лог (последние 200 событий)
  fastify.get('/admin/audit', { preHandler: requireAdmin }, async (req) => {
    const event = req.query.event || null;
    let q = 'SELECT id, user_id, email, event, detail, ip, created_at FROM audit_log';
    const params = [];
    if (event) {
      q += ' WHERE event=$1';
      params.push(event);
    }
    q += ' ORDER BY created_at DESC LIMIT 200';
    const result = await db.query(q, params);
    return result.rows;
  });

  // GET /admin/stats — базовая статистика
  fastify.get('/admin/stats', { preHandler: requireAdmin }, async () => {
    const users = await db.query("SELECT COUNT(*) FROM users WHERE role != 'admin'");
    const trials = await db.query("SELECT COUNT(*) FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status='trial' AND u.role != 'admin'");
    const active = await db.query("SELECT COUNT(*) FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status='active' AND u.role != 'admin'");
    const expired = await db.query("SELECT COUNT(*) FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status='expired' AND u.role != 'admin'");
    const pendingPayments = await db.query("SELECT COUNT(*) FROM payments WHERE status='pending'");
    return {
      totalUsers: Number(users.rows[0].count),
      trials: Number(trials.rows[0].count),
      active: Number(active.rows[0].count),
      expired: Number(expired.rows[0].count),
      pendingPayments: Number(pendingPayments.rows[0].count)
    };
  });
}

module.exports = adminRoutes;
