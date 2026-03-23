const db = require('../db');
const { requireAdmin } = require('../middleware');
const { sendPaymentConfirmed } = require('../email');

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
      'SELECT p.*, u.email FROM payments p JOIN users u ON u.id=p.user_id WHERE p.status=$1 ORDER BY p.created_at DESC',
      [status]
    );
    return result.rows;
  });

  // POST /admin/payments/:id/confirm — подтвердить оплату
  fastify.post('/admin/payments/:id/confirm', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params;
    const { months, comment } = req.body || {};
    const days = (months || 1) * 30;
    const payment = await db.query('SELECT * FROM payments WHERE id=$1', [id]);
    if (!payment.rows.length) return reply.status(404).send({ error: 'Платёж не найден' });
    const p = payment.rows[0];
    await db.query("UPDATE payments SET status='confirmed', admin_comment=$2, updated_at=now() WHERE id=$1", [id, comment || null]);
    // продлить подписку
    const sub = await db.query('SELECT * FROM subscriptions WHERE user_id=$1', [p.user_id]);
    if (sub.rows.length) {
      const current = sub.rows[0];
      const baseDate = (current.status === 'active' && new Date(current.active_until) > new Date()) ? new Date(current.active_until) : new Date();
      const newUntil = new Date(baseDate.getTime() + days * 86400000);
      await db.query("UPDATE subscriptions SET status='active', active_until=$2, updated_at=now() WHERE user_id=$1", [p.user_id, newUntil]);
    }
    // audit log
    await db.query(
      "INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES ($1, 'payment_confirmed', 'payment', $2, $3)",
      [req.user.sub, id, JSON.stringify({ months: months || 1, days })]
    );
    // отправить email подтверждения
    const userRes = await db.query('SELECT email FROM users WHERE id=$1', [p.user_id]);
    if (userRes.rows.length) {
      sendPaymentConfirmed(userRes.rows[0].email, days).catch(e => fastify.log.error(e, 'Payment confirmed email error'));
    }
    return { ok: true, message: 'Подписка активирована на ' + days + ' дней' };
  });

  // POST /admin/payments/:id/reject — отклонить платёж
  fastify.post('/admin/payments/:id/reject', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params;
    const { comment } = req.body || {};
    await db.query("UPDATE payments SET status='rejected', admin_comment=$2, updated_at=now() WHERE id=$1", [id, comment || 'Отклонено']);
    return { ok: true };
  });

  // POST /admin/users/:id/block — заблокировать пользователя
  fastify.post('/admin/users/:id/block', { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params;
    await db.query('UPDATE users SET is_blocked=true, updated_at=now() WHERE id=$1', [id]);
    await db.query("UPDATE subscriptions SET status='blocked', updated_at=now() WHERE user_id=$1", [id]);
    await db.query('DELETE FROM refresh_sessions WHERE user_id=$1', [id]);
    await db.query("INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'user_blocked', 'user', $2)", [req.user.sub, id]);
    return { ok: true };
  });

  // POST /admin/users/:id/unblock — разблокировать
  fastify.post('/admin/users/:id/unblock', { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params;
    await db.query('UPDATE users SET is_blocked=false, updated_at=now() WHERE id=$1', [id]);
    await db.query("INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'user_unblocked', 'user', $2)", [req.user.sub, id]);
    return { ok: true };
  });

  // GET /admin/stats — базовая статистика
  fastify.get('/admin/stats', { preHandler: requireAdmin }, async () => {
    const users = await db.query('SELECT COUNT(*) FROM users');
    const trials = await db.query("SELECT COUNT(*) FROM subscriptions WHERE status='trial'");
    const active = await db.query("SELECT COUNT(*) FROM subscriptions WHERE status='active'");
    const expired = await db.query("SELECT COUNT(*) FROM subscriptions WHERE status='expired'");
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
