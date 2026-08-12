const db = require('../db');
const { requireAdmin } = require('../middleware');
const { sendPaymentConfirmed, sendPaymentRejected, sendSubscriptionExtended, sendFeedbackReply, sendTestingInvitation, previewPersonalMessage, sendPersonalMessage } = require('../email');
const audit = require('../audit');
const { EARLY_ACCESS_LIMIT, EARLY_ACCESS_PRICES, EARLY_ACCESS_GRACE_MS, getEarlyAccessState } = require('../early-access');

const CONFIRM_PAYMENT_MONTHS = new Set([1, 3, 6, 12]);
const PAYMENT_STATUSES = new Set(['pending', 'confirmed', 'rejected']);
const FEEDBACK_STATUSES = new Set(['waiting_admin', 'waiting_user', 'closed', 'new']);
const AUDIT_EVENTS = new Set([
  'login',
  'platform_visit',
  'login_blocked',
  'register',
  'trial_granted',
  'trial_denied',
  'trial_fingerprint_invalid',
  'trial_fingerprint_missing',
  'trial_network_watch',
  'trial_network_alert',
  'admin_mfa_failed',
  'admin_oauth_denied',
  'payment_submit',
  'payment_confirm',
  'payment_reject',
  'early_access_adjust',
  'user_block',
  'user_unblock',
  'user_delete',
  'subscription_extend',
  'feedback_reply',
  'review_delete',
  'review_reply',
  'video_request_status',
  'news_create',
  'news_update',
  'news_delete',
  'recipe_create',
  'recipe_update',
  'recipe_delete',
  'recipe_seasonal_set',
  'recipe_seasonal_clear',
  'recipe_category_order_update',
  'ingredient_catalog_upsert',
  'category_create',
  'category_update',
  'category_delete',
  'testing_invitation_send',
  'personal_message_send',
]);
const ADMIN_READ_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };
const ADMIN_HEAVY_READ_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };
const ADMIN_EMAIL_SEND_RATE_LIMIT = { max: 10, timeWindow: '1 hour' };
const PERSONAL_MESSAGE_SUBJECT_LIMIT = 180;
const PERSONAL_MESSAGE_TEXT_LIMIT = 6000;
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

function readPersonalMessagePayload(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Укажите корректный email' };
  if (body.sender !== 'yulia' && body.sender !== 'hello') return { error: 'Выберите отправителя' };
  if (typeof body.subject !== 'string' || !body.subject.trim()) return { error: 'Укажите тему письма' };
  if (body.subject.trim().length > PERSONAL_MESSAGE_SUBJECT_LIMIT) return { error: 'Тема слишком длинная' };
  if (typeof body.text !== 'string' || !body.text.trim()) return { error: 'Введите текст письма' };
  if (body.text.trim().length > PERSONAL_MESSAGE_TEXT_LIMIT) return { error: 'Текст письма слишком длинный' };
  return {
    value: {
      email,
      sender: body.sender,
      subject: body.subject.trim(),
      text: body.text.trim()
    }
  };
}

async function adminRoutes(fastify) {

  // GET /admin/recipe-category-order/:categoryId — all category recipes in their independent order.
  fastify.get('/admin/recipe-category-order/:categoryId', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_READ_RATE_LIMIT }
  }, async (req, reply) => {
    const categoryId = String(req.params.categoryId || '').trim();
    const category = await db.query('SELECT id, name FROM categories WHERE id=$1', [categoryId]);
    if (!category.rows.length) return reply.status(404).send({ error: 'Категория не найдена' });
    const recipes = await db.query(
      `SELECT r.id, r.name, r.emoji, r.photo, r.is_published, r.access_level, r.is_free,
              rco.sort_order
         FROM recipe_category_order rco
         JOIN recipes r ON r.id = rco.recipe_id
        WHERE rco.category_id=$1
        ORDER BY rco.sort_order, r.created_at, r.id`,
      [categoryId]
    );
    return { category: category.rows[0], recipes: recipes.rows };
  });

  // PUT /admin/recipe-category-order/:categoryId — replace one category's complete order atomically.
  fastify.put('/admin/recipe-category-order/:categoryId', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const categoryId = String(req.params.categoryId || '').trim();
    const recipeIds = req.body?.recipe_ids;
    if (!Array.isArray(recipeIds) || !recipeIds.length || recipeIds.length > 500 ||
        recipeIds.some(id => typeof id !== 'string' || !id.trim()) ||
        new Set(recipeIds).size !== recipeIds.length) {
      return reply.status(400).send({ error: 'Передайте полный список уникальных ID рецептов категории' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const category = await client.query('SELECT id FROM categories WHERE id=$1 FOR KEY SHARE', [categoryId]);
      if (!category.rows.length) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ error: 'Категория не найдена' });
      }
      const current = await client.query(
        'SELECT recipe_id FROM recipe_category_order WHERE category_id=$1 FOR UPDATE',
        [categoryId]
      );
      const currentIds = current.rows.map(row => row.recipe_id);
      if (currentIds.length !== recipeIds.length ||
          currentIds.some(id => !recipeIds.includes(id))) {
        await client.query('ROLLBACK');
        return reply.status(409).send({ error: 'Состав категории изменился. Обновите список и повторите попытку.' });
      }
      await client.query(
        `UPDATE recipe_category_order AS rco
            SET sort_order = ordered.position * 10
           FROM unnest($2::text[]) WITH ORDINALITY AS ordered(recipe_id, position)
          WHERE rco.category_id=$1 AND rco.recipe_id=ordered.recipe_id`,
        [categoryId, recipeIds]
      );
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
    await audit.log('recipe_category_order_update', {
      userId: req.user.sub,
      detail: 'category:' + categoryId + '; recipes=' + recipeIds.length,
      ip: req.ip
    });
    return { ok: true, category_id: categoryId, recipe_ids: recipeIds };
  });

  // POST /admin/testing-invitations — one addressed tester invitation, never a bulk send
  fastify.post('/admin/testing-invitations', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_EMAIL_SEND_RATE_LIMIT }
  }, async (req, reply) => {
    const { email, displayName } = req.body || {};
    const recipient = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return reply.status(400).send({ error: 'Укажите корректный email' });
    }
    if (displayName != null && typeof displayName !== 'string') {
      return reply.status(400).send({ error: 'Некорректное имя' });
    }
    const name = typeof displayName === 'string' ? displayName.trim().slice(0, 100) : '';
    const userResult = await db.query(
      'SELECT display_name, unsubscribe_token FROM users WHERE email=$1 LIMIT 1',
      [recipient]
    );
    const user = userResult.rows[0];
    const recipientName = name || user?.display_name || '';
    try {
      await sendTestingInvitation(recipient, user?.unsubscribe_token || null, recipientName);
    } catch (err) {
      fastify.log.error(err, 'Testing invitation email error');
      return reply.status(500).send({ error: 'Не удалось отправить письмо' });
    }
    await audit.log('testing_invitation_send', {
      userId: req.user.sub,
      email: recipient,
      detail: recipientName ? 'name=' + recipientName : 'without_name',
      ip: req.ip
    });
    return { ok: true, email: recipient };
  });

  // POST /admin/personal-messages — branded, one-to-one message or safe preview
  fastify.post('/admin/personal-messages', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_EMAIL_SEND_RATE_LIMIT }
  }, async (req, reply) => {
    const body = req.body || {};
    if (body.preview != null && typeof body.preview !== 'boolean') {
      return reply.status(400).send({ error: 'Некорректный режим предпросмотра' });
    }
    const parsed = readPersonalMessagePayload(body);
    if (parsed.error) return reply.status(400).send({ error: parsed.error });
    const payload = parsed.value;

    if (body.preview === true) {
      try {
        return { html: previewPersonalMessage(payload) };
      } catch (err) {
        fastify.log.error(err, 'Personal message preview error');
        return reply.status(500).send({ error: 'Не удалось собрать предпросмотр' });
      }
    }

    try {
      const result = await sendPersonalMessage(payload.email, payload);
      const sentCopy = result && result.sentCopy ? result.sentCopy : { saved: false, reason: 'not_configured' };
      await audit.log('personal_message_send', {
        userId: req.user.sub,
        email: payload.email,
        detail: payload.sender + '; chars=' + payload.text.length + '; sent_copy=' + (sentCopy.saved ? 'saved' : sentCopy.reason),
        ip: req.ip
      });
      return { ok: true, email: payload.email, sentCopy };
    } catch (err) {
      fastify.log.error(err, 'Personal message email error');
      return reply.status(500).send({ error: 'Не удалось отправить письмо' });
    }
  });

  // GET /admin/users — список пользователей
  fastify.get('/admin/users', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_READ_RATE_LIMIT }
  }, async (req) => {
    const { limit, offset } = parseListWindow(req.query || {}, 200);
    const result = await db.query(
      `SELECT u.id, u.email, u.display_name, u.role, u.is_blocked, u.created_at,
              s.status as sub_status, s.trial_ends_at, s.active_until,
              activity.last_activity_at, activity.active_days_7d, activity.active_days_30d
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id=u.id
       LEFT JOIN LATERAL (
         SELECT MAX(event_at) AS last_activity_at,
                COUNT(DISTINCT (event_at AT TIME ZONE 'Europe/Moscow')::date)
                  FILTER (WHERE event_at >= now() - interval '7 days')::int AS active_days_7d,
                COUNT(DISTINCT (event_at AT TIME ZONE 'Europe/Moscow')::date)
                  FILTER (WHERE event_at >= now() - interval '30 days')::int AS active_days_30d
         FROM (
           SELECT a.created_at AS event_at
           FROM audit_log a
           WHERE a.user_id=u.id AND a.event IN ('platform_visit', 'login')
           UNION ALL
           SELECT m.created_at AS event_at
           FROM feedback_messages f
           JOIN feedback_thread_messages m ON m.feedback_id=f.id
           WHERE f.user_id=u.id AND m.sender_type='user'
         ) AS activity_events
       ) activity ON TRUE
       ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`,
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

  // Early-access capacity is derived from confirmed members. Adjustments are an
  // auditable reserve for exceptional manual corrections, never a replacement
  // for payment history.
  fastify.get('/admin/early-access', {
    preHandler: requireAdmin,
    config: { rateLimit: ADMIN_READ_RATE_LIMIT }
  }, async () => getEarlyAccessState());

  fastify.post('/admin/early-access/adjustments', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const delta = Number(req.body?.slotsDelta);
    const comment = String(req.body?.comment || '').trim();
    if (!Number.isInteger(delta) || delta === 0 || delta < -30 || delta > 30) {
      return reply.status(400).send({ error: 'Укажите целое число мест от -30 до 30, кроме нуля' });
    }
    if (comment.length < 3 || comment.length > 500) {
      return reply.status(400).send({ error: 'Добавьте короткий комментарий от 3 до 500 символов' });
    }
    await db.query(
      'INSERT INTO early_access_adjustments (slots_delta, comment, created_by) VALUES ($1,$2,$3)',
      [delta, comment, req.user.sub]
    );
    await audit.log('early_access_adjust', { userId: req.user.sub, detail: (delta > 0 ? '+' : '') + delta + ' мест: ' + comment, ip: req.ip });
    return getEarlyAccessState();
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
      // Serialise the last early-access seat: only confirmed payments can claim it.
      await client.query('SELECT pg_advisory_xact_lock(20260714)');
      const memberResult = await client.query(
        `SELECT u.early_access_member, s.active_until
           FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id
          WHERE u.id=$1`, [p.user_id]
      );
      const member = memberResult.rows[0] || {};
      const earlyAmount = EARLY_ACCESS_PRICES[normalizedMonths];
      const requestsEarlyPrice = Number(p.amount) === Number(earlyAmount);
      let grantsEarlyMembership = false;
      if (requestsEarlyPrice) {
        if (member.early_access_member) {
          const renewalDeadline = member.active_until && new Date(member.active_until).getTime() + EARLY_ACCESS_GRACE_MS;
          if (!renewalDeadline || renewalDeadline < Date.now()) {
            await client.query('ROLLBACK');
            return reply.status(409).send({ error: 'Льготный период ранней цены завершён: подтвердите оплату по актуальному тарифу.' });
          }
        } else {
          const earlyState = await getEarlyAccessState(p.user_id, client.query.bind(client));
          if (!earlyState.eligible || earlyState.remaining < 1) {
            await client.query('ROLLBACK');
            return reply.status(409).send({ error: 'Все места раннего доступа уже заняты. Подтвердите оплату по актуальному тарифу.' });
          }
          grantsEarlyMembership = true;
        }
      }
      // UPSERT подписку: продлить существующую или создать новую
      const sub = await client.query('SELECT * FROM subscriptions WHERE user_id=$1', [p.user_id]);
      let newUntil;
      if (sub.rows.length) {
        const current = sub.rows[0];
        const baseDate = (current.status === 'active' && new Date(current.active_until) > new Date()) ? new Date(current.active_until) : new Date();
        newUntil = new Date(baseDate.getTime() + days * 86400000);
        await client.query("UPDATE subscriptions SET status='active', active_until=$2, expiry_reminder_sent_at=NULL, updated_at=now() WHERE user_id=$1", [p.user_id, newUntil]);
      } else {
        newUntil = new Date(Date.now() + days * 86400000);
        await client.query(
          "INSERT INTO subscriptions (user_id, status, active_until) VALUES ($1, 'active', $2)",
          [p.user_id, newUntil]
        );
      }
      if (grantsEarlyMembership) {
        await client.query(
          'UPDATE users SET early_access_member=true, early_access_granted_at=now() WHERE id=$1',
          [p.user_id]
        );
      }
      await client.query('COMMIT');
      // отправить email подтверждения (вне транзакции)
      const userRes = await db.query('SELECT email FROM users WHERE id=$1', [p.user_id]);
      const payEmail = userRes.rows.length ? userRes.rows[0].email : null;
      await audit.log('payment_confirm', { userId: req.user.sub, email: payEmail, detail: 'payment#' + id + ' +' + days + 'd', ip: req.ip });
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
    await audit.log('payment_reject', { userId: req.user.sub, email: userEmail, detail: 'payment#' + id, ip: req.ip });
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
    await audit.log('user_block', { userId: req.user.sub, detail: 'blocked user#' + id, ip: req.ip });
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
    await audit.log('user_unblock', { userId: req.user.sub, detail: 'unblocked user#' + id, ip: req.ip });
    return { ok: true };
  });

  // DELETE /admin/users/:id — полностью удалить тестового пользователя
  fastify.delete('/admin/users/:id', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parseUserId(req.params.id);
    if (!id) return reply.status(400).send({ error: 'Некорректный id пользователя' });

    const confirmEmail = typeof (req.body && req.body.confirmEmail) === 'string'
      ? req.body.confirmEmail.trim().toLowerCase()
      : '';
    if (!confirmEmail) {
      return reply.status(400).send({ error: 'Введите email пользователя для подтверждения удаления' });
    }

    const client = await db.pool.connect();
    let deletedEmail = null;
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        'SELECT id, email, role FROM users WHERE id=$1 FOR UPDATE',
        [id]
      );
      if (!userRes.rows.length) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ error: 'Пользователь не найден' });
      }

      const target = userRes.rows[0];
      if (target.role === 'admin') {
        await client.query('ROLLBACK');
        return reply.status(400).send({ error: 'Администратора удалить нельзя' });
      }
      if (String(target.email || '').trim().toLowerCase() !== confirmEmail) {
        await client.query('ROLLBACK');
        return reply.status(400).send({ error: 'Email не совпадает' });
      }

      const confirmedPayment = await client.query(
        "SELECT 1 FROM payments WHERE user_id=$1 AND status='confirmed' LIMIT 1",
        [id]
      );
      if (confirmedPayment.rows.length) {
        await client.query('ROLLBACK');
        return reply.status(409).send({ error: 'Нельзя удалить пользователя с подтверждённой оплатой' });
      }

      // У обращений нет ON DELETE CASCADE; сообщения треда удалятся вместе с обращениями.
      await client.query('UPDATE feedback_messages SET admin_id=NULL WHERE admin_id=$1', [id]);
      await client.query('DELETE FROM feedback_messages WHERE user_id=$1', [id]);
      await client.query('DELETE FROM users WHERE id=$1', [id]);
      await client.query('COMMIT');
      deletedEmail = target.email || null;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await audit.log('user_delete', {
      userId: req.user.sub,
      email: deletedEmail,
      detail: 'deleted test user#' + id,
      ip: req.ip
    });
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
        await client.query("UPDATE subscriptions SET status='active', active_until=$2, expiry_reminder_sent_at=NULL, updated_at=now() WHERE user_id=$1", [id, newUntil]);
      } else {
        newUntil = new Date(Date.now() + days * 86400000);
        await client.query(
          "INSERT INTO subscriptions (user_id, status, active_until) VALUES ($1, 'active', $2)",
          [id, newUntil]
        );
      }
      await client.query('COMMIT');
      await audit.log('subscription_extend', { userId: req.user.sub, email: userRes.rows[0].email, detail: 'user#' + id + ' +' + days + 'd → ' + newUntil.toISOString(), ip: req.ip });
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
    if (typeof replyText !== 'string') return reply.status(400).send({ error: 'Введите текст ответа' });
    const trimmed = replyText.trim();
    if (!trimmed) return reply.status(400).send({ error: 'Введите текст ответа' });
    if (trimmed.length > 5000) return reply.status(400).send({ error: 'Слишком длинный ответ' });

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
    await audit.log('feedback_reply', { userId: req.user.sub, detail: 'feedback#' + id, ip: req.ip });
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
    const activity = await db.query(
      `WITH activity_events AS (
         SELECT user_id, created_at AS event_at
         FROM audit_log
         WHERE event IN ('platform_visit', 'login')
         UNION
         SELECT f.user_id, m.created_at AS event_at
         FROM feedback_messages f
         JOIN feedback_thread_messages m ON m.feedback_id=f.id
         WHERE m.sender_type='user'
       )
       SELECT
         COUNT(DISTINCT a.user_id) FILTER (WHERE a.event_at >= now() - interval '7 days')::int AS active_users_7d,
         COUNT(DISTINCT a.user_id) FILTER (WHERE a.event_at >= now() - interval '30 days')::int AS active_users_30d
       FROM activity_events a
       JOIN users u ON u.id=a.user_id
       WHERE u.role != 'admin'`
    );
    const activityCounts = activity.rows[0] || {};
    return {
      totalUsers: Number(users.rows[0].count),
      trials: Number(trials.rows[0].count),
      active: Number(active.rows[0].count),
      expired: Number(expired.rows[0].count),
      blocked: Number(blocked.rows[0].count),
      pendingPayments: Number(pendingPayments.rows[0].count),
      activeUsers7d: Number(activityCounts.active_users_7d || 0),
      activeUsers30d: Number(activityCounts.active_users_30d || 0)
    };
  });
}

module.exports = adminRoutes;
