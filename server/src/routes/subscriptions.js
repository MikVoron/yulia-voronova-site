const db = require('../db');
const { authenticate, optionalAuthenticate } = require('../middleware');
const { sendPaymentNotification, sendFeedback } = require('../email');
const audit = require('../audit');
const { normalizeDietaryPreferences } = require('../dietary');

const PAYMENT_SCREENSHOT_MAX_LENGTH = 7 * 1024 * 1024;
const PAYMENT_COMMENT_MAX_LENGTH = 1000;
const PAYMENT_SCREENSHOT_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const PAYMENT_HISTORY_LIMIT = 200;
const FEEDBACK_THREAD_LIST_LIMIT = 100;
const FEEDBACK_TEXT_LIMIT = 2000;
const FEEDBACK_CATEGORIES = new Set(['wish', 'recipe', 'problem']);
const USER_SETTINGS_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };
const FEEDBACK_STATE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };
const FEEDBACK_READ_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };
const EARLY_ACCESS_LIMIT = 50;
const EARLY_ACCESS_END = new Date('2026-09-30T20:59:59.999Z');
const EARLY_ACCESS_AMOUNTS = [250, 690, 2490];
const EARLY_ACCESS_PRICES = { 1: 250, 3: 690, 12: 2490 };
const REGULAR_PRICES = { 1: 390, 3: 990, 12: 2990 };

async function getEarlyAccessState(userId) {
  const reservedResult = await db.query(
    `SELECT COUNT(DISTINCT p.user_id)::int AS count
       FROM payments p
       JOIN users u ON u.id = p.user_id
      WHERE p.status IN ('pending', 'confirmed')
        AND p.amount = ANY($1::numeric[])
        AND p.created_at <= $2
        AND u.role != 'admin'`,
    [EARLY_ACCESS_AMOUNTS, EARLY_ACCESS_END]
  );
  const reserved = Number(reservedResult.rows[0]?.count || 0);
  const remaining = Math.max(0, EARLY_ACCESS_LIMIT - reserved);
  const campaignActive = new Date() <= EARLY_ACCESS_END && remaining > 0;

  let confirmedEarlyPayments = 0;
  let earlyMember = false;
  if (userId) {
    const userResult = await db.query(
      `SELECT COUNT(*)::int AS count, MIN(created_at) AS first_early_payment_at
         FROM payments
        WHERE user_id = $1
          AND status = 'confirmed'
          AND amount = ANY($2::numeric[])`,
      [userId, EARLY_ACCESS_AMOUNTS]
    );
    confirmedEarlyPayments = Number(userResult.rows[0]?.count || 0);
    const firstEarlyPaymentAt = userResult.rows[0]?.first_early_payment_at;
    earlyMember = !!firstEarlyPaymentAt && new Date(firstEarlyPaymentAt) <= EARLY_ACCESS_END;
  }

  const renewalAvailable = earlyMember && confirmedEarlyPayments === 1;
  const renewalUsed = earlyMember && confirmedEarlyPayments >= 2;
  const eligible = renewalAvailable || (!earlyMember && confirmedEarlyPayments === 0 && campaignActive);
  const eligibility = renewalAvailable
    ? 'renewal'
    : (renewalUsed ? 'standard' : (campaignActive ? 'first_purchase' : 'standard'));

  return {
    active: campaignActive,
    eligible,
    eligibility,
    renewalAvailable,
    renewalUsed,
    remaining,
    limit: EARLY_ACCESS_LIMIT,
    endsAt: EARLY_ACCESS_END.toISOString(),
    prices: eligible ? EARLY_ACCESS_PRICES : REGULAR_PRICES,
    earlyPrices: EARLY_ACCESS_PRICES,
    regularPrices: REGULAR_PRICES
  };
}

function normalizePaymentRequest(body) {
  const amount = Number(body && body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    return { error: 'Некорректная сумма платежа' };
  }

  const paymentDate = String((body && body.paymentDate) || '').trim();
  if (!paymentDate || Number.isNaN(Date.parse(paymentDate))) {
    return { error: 'Некорректная дата платежа' };
  }

  const comment = String((body && body.comment) || '').trim();
  if (comment.length > PAYMENT_COMMENT_MAX_LENGTH) {
    return { error: 'Комментарий слишком длинный' };
  }

  let screenshot = null;
  if (body && body.screenshot) {
    screenshot = String(body.screenshot);
    if (screenshot.length > PAYMENT_SCREENSHOT_MAX_LENGTH) {
      return { error: 'Скриншот слишком большой' };
    }
    if (!PAYMENT_SCREENSHOT_RE.test(screenshot)) {
      return { error: 'Некорректный формат скриншота' };
    }
  }

  return { amount, paymentDate, comment: comment || null, screenshot };
}

function normalizeFeedbackText(value) {
  if (typeof value !== 'string') return { error: 'Введите текст' };
  const text = value.trim();
  if (!text) return { error: 'Введите текст' };
  if (text.length > FEEDBACK_TEXT_LIMIT) return { error: 'Слишком длинный текст' };
  return { text };
}

function normalizeFeedbackCategory(value) {
  if (value == null || value === '') return 'wish';
  if (typeof value !== 'string') return null;
  const category = value.trim();
  return FEEDBACK_CATEGORIES.has(category) ? category : null;
}

async function subscriptionRoutes(fastify) {

  // GET /subscription/early-bird — сколько осталось мест по спеццене
  fastify.get('/subscription/early-bird', { preHandler: optionalAuthenticate }, async (req) => {
    return getEarlyAccessState(req.user?.sub);
  });

  // GET /subscription — статус подписки текущего пользователя
  fastify.get('/subscription', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      `SELECT u.role, s.status, s.trial_ends_at, s.active_until, s.created_at,
              (s.status = 'expired'
                AND s.trial_ends_at IS NOT NULL
                AND s.created_at IS NOT NULL
                AND s.trial_ends_at <= s.created_at + interval '1 minute') AS trial_not_granted
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id
        WHERE u.id=$1`,
      [req.user.sub]
    );
    if (!result.rows.length) return { status: 'none' };
    const sub = result.rows[0];
    if (sub.role === 'admin') {
      return {
        status: 'active',
        trialEndsAt: null,
        activeUntil: null,
        createdAt: sub.created_at || null,
        isAdmin: true
      };
    }
    if (!sub.status) return { status: 'none' };
    const now = new Date();
    let daysLeft = 0;
    if (sub.status === 'trial' && sub.trial_ends_at) {
      daysLeft = Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - now) / 86400000));
    } else if (sub.status === 'active' && sub.active_until) {
      daysLeft = Math.max(0, Math.ceil((new Date(sub.active_until) - now) / 86400000));
    }
    return {
      status: sub.status,
      trialEndsAt: sub.trial_ends_at,
      activeUntil: sub.active_until,
      daysLeft,
      createdAt: sub.created_at,
      trialNotGranted: sub.trial_not_granted === true
    };
  });

  // POST /subscription/payment — пользователь сообщает об оплате
  fastify.post('/subscription/payment', {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const paymentInput = normalizePaymentRequest(req.body || {});
    if (paymentInput.error) return reply.status(400).send({ error: paymentInput.error });
    const { amount, paymentDate, comment, screenshot } = paymentInput;
    // Защита от обычного повторного submit и прямого одиночного API-запроса.
    // Параллельные POST дополнительно закрывает partial unique index
    // idx_payments_one_pending_per_user.
    const existingPending = await db.query(
      "SELECT id FROM payments WHERE user_id=$1 AND status='pending' LIMIT 1",
      [req.user.sub]
    );
    if (existingPending.rows.length) {
      return reply.status(409).send({ error: 'У вас уже есть платёж на проверке. Дождитесь подтверждения или напишите в поддержку.' });
    }
    // email берём из JWT — надёжнее чем из формы
    const emailRow = await db.query('SELECT email FROM users WHERE id=$1', [req.user.sub]);
    const senderEmail = emailRow.rows[0]?.email || '';
    try {
      await db.query(
        'INSERT INTO payments (user_id, amount, sender_name, payment_date, user_comment, screenshot, status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.user.sub, amount, senderEmail, paymentDate, comment, screenshot, 'pending']
      );
    } catch (e) {
      if (e.code === '23505' && e.constraint === 'idx_payments_one_pending_per_user') {
        return reply.status(409).send({ error: 'У вас уже есть платёж на проверке. Дождитесь подтверждения или напишите в поддержку.' });
      }
      throw e;
    }
    audit.log('payment_submit', { userId: req.user.sub, email: senderEmail, detail: amount + '₽', ip: req.ip });
    sendPaymentNotification(senderEmail, amount, paymentDate, !!screenshot).catch(err => fastify.log.error(err, 'payment notification email failed'));
    return { ok: true, message: 'Платёж отправлен на проверку' };
  });

  // GET /subscription/payments — история платежей пользователя
  fastify.get('/subscription/payments', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT id, amount, sender_name, payment_date, status, admin_comment, notice_dismissed_at, created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',
      [req.user.sub, PAYMENT_HISTORY_LIMIT]
    );
    return result.rows;
  });

  // PUT /subscription/payments/:id/dismiss-notice — hide a rejected notice on every device
  fastify.put('/subscription/payments/:id/dismiss-notice', {
    preHandler: authenticate,
    config: { rateLimit: USER_SETTINGS_RATE_LIMIT }
  }, async (req, reply) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return reply.status(400).send({ error: 'Некорректный id платежа' });
    }
    const result = await db.query(
      `UPDATE payments
          SET notice_dismissed_at=COALESCE(notice_dismissed_at, now())
        WHERE id=$1 AND user_id=$2 AND status='rejected'
        RETURNING notice_dismissed_at`,
      [id, req.user.sub]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Отклонённый платёж не найден' });
    return { ok: true, noticeDismissedAt: result.rows[0].notice_dismissed_at };
  });
  // GET /subscription/newsletter — статус подписки на рассылку
  fastify.get('/subscription/newsletter', { preHandler: authenticate }, async (req) => {
    const result = await db.query('SELECT newsletter_subscribed FROM users WHERE id=$1', [req.user.sub]);
    return { subscribed: result.rows[0]?.newsletter_subscribed ?? true };
  });

  // PUT /subscription/newsletter — переключить подписку на рассылку
  fastify.put('/subscription/newsletter', {
    preHandler: authenticate,
    config: { rateLimit: USER_SETTINGS_RATE_LIMIT }
  }, async (req) => {
    const { subscribed } = req.body || {};
    await db.query('UPDATE users SET newsletter_subscribed=$1 WHERE id=$2', [!!subscribed, req.user.sub]);
    return { subscribed: !!subscribed };
  });

  // GET /subscription/dietary-preferences — recipe visibility preferences
  fastify.get('/subscription/dietary-preferences', { preHandler: authenticate }, async (req) => {
    const result = await db.query('SELECT dietary_preferences FROM users WHERE id=$1', [req.user.sub]);
    return normalizeDietaryPreferences(result.rows[0]?.dietary_preferences);
  });

  // PUT /subscription/dietary-preferences — replace recipe visibility preferences
  fastify.put('/subscription/dietary-preferences', {
    preHandler: authenticate,
    config: { rateLimit: USER_SETTINGS_RATE_LIMIT }
  }, async (req) => {
    const preferences = normalizeDietaryPreferences(req.body);
    await db.query('UPDATE users SET dietary_preferences=$1::jsonb WHERE id=$2', [
      JSON.stringify(preferences),
      req.user.sub,
    ]);
    return preferences;
  });

  // ===== Обращения (feedback) — треды/диалоги =====
  // Статусы: waiting_admin | waiting_user | closed
  // Диалог хранится в feedback_thread_messages; feedback_messages — шапка.
  // Старые поля text/admin_reply/admin_replied_at/reply_seen в шапке — deprecated,
  // оставлены для исторической совместимости. Новый код их не использует как источник правды.

  // POST /feedback — создать обращение (шапка + первое сообщение пользователя)
  fastify.post('/feedback', {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const { category, text } = req.body || {};
    const textInput = normalizeFeedbackText(text);
    if (textInput.error) return reply.status(400).send({ error: textInput.error });
    const cat = normalizeFeedbackCategory(category);
    if (!cat) return reply.status(400).send({ error: 'Некорректная категория обращения' });
    const trimmed = textInput.text;
    const email = req.user.email;

    const client = await db.pool.connect();
    let feedbackId;
    try {
      await client.query('BEGIN');
      // Шапка: text дублируем (deprecated-поле), чтобы старые админ-инструменты не падали
      const ins = await client.query(
        `INSERT INTO feedback_messages (user_id, category, text, status)
         VALUES ($1, $2, $3, 'waiting_admin')
         RETURNING id, category, status, created_at, updated_at`,
        [req.user.sub, cat, trimmed]
      );
      feedbackId = ins.rows[0].id;
      await client.query(
        `INSERT INTO feedback_thread_messages (feedback_id, sender_type, sender_id, text)
         VALUES ($1, 'user', $2, $3)`,
        [feedbackId, req.user.sub, trimmed]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    sendFeedback(email, cat, trimmed).catch(e => fastify.log.error(e, 'Feedback email error'));

    return await loadFeedbackThread(feedbackId, req.user.sub);
  });

  // POST /feedback/:id/messages — уточнение пользователя в существующем обращении
  fastify.post('/feedback/:id/messages', {
    preHandler: authenticate,
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Некорректный id' });
    const { text } = req.body || {};
    const textInput = normalizeFeedbackText(text);
    if (textInput.error) return reply.status(400).send({ error: textInput.error });
    const trimmed = textInput.text;

    // Проверка владельца, статуса и soft-delete
    const head = await db.query(
      `SELECT id, user_id, category, status, user_deleted_at
         FROM feedback_messages WHERE id=$1`,
      [id]
    );
    if (!head.rows.length || head.rows[0].user_id !== req.user.sub) {
      return reply.status(404).send({ error: 'Обращение не найдено' });
    }
    if (head.rows[0].user_deleted_at) {
      return reply.status(404).send({ error: 'Обращение не найдено' });
    }
    if (head.rows[0].status === 'closed') {
      return reply.status(409).send({ error: 'Обращение закрыто. Создайте новое.' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO feedback_thread_messages (feedback_id, sender_type, sender_id, text)
         VALUES ($1, 'user', $2, $3)`,
        [id, req.user.sub, trimmed]
      );
      await client.query(
        `UPDATE feedback_messages SET status='waiting_admin', updated_at=now() WHERE id=$1`,
        [id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Email админу о новом сообщении пользователя в существующем обращении
    sendFeedback(req.user.email, head.rows[0].category, trimmed, { followUp: true, feedbackId: id })
      .catch(e => fastify.log.error(e, 'Feedback follow-up email error'));

    return await loadFeedbackThread(id, req.user.sub);
  });

  // POST /feedback/:id/close — пользователь отмечает вопрос решённым
  fastify.post('/feedback/:id/close', {
    preHandler: authenticate,
    config: { rateLimit: FEEDBACK_STATE_RATE_LIMIT }
  }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Некорректный id' });
    const result = await db.query(
      `UPDATE feedback_messages
          SET status='closed', updated_at=now()
        WHERE id=$1 AND user_id=$2 AND user_deleted_at IS NULL
        RETURNING id`,
      [id, req.user.sub]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Обращение не найдено' });
    return await loadFeedbackThread(id, req.user.sub);
  });

  // GET /feedback — обращения текущего пользователя с тредами
  fastify.get('/feedback', {
    preHandler: authenticate,
    config: { rateLimit: FEEDBACK_READ_RATE_LIMIT }
  }, async (req) => {
    const heads = await db.query(
      `SELECT id, category, status, created_at, updated_at
         FROM feedback_messages
        WHERE user_id=$1 AND user_deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC
        LIMIT $2`,
      [req.user.sub, FEEDBACK_THREAD_LIST_LIMIT]
    );
    if (!heads.rows.length) return [];
    const ids = heads.rows.map(r => r.id);
    const msgs = await db.query(
      `SELECT id, feedback_id, sender_type, text, seen_at, created_at
         FROM feedback_thread_messages
        WHERE feedback_id = ANY($1::int[])
        ORDER BY created_at ASC, id ASC`,
      [ids]
    );
    const byThread = new Map();
    for (const m of msgs.rows) {
      if (!byThread.has(m.feedback_id)) byThread.set(m.feedback_id, []);
      byThread.get(m.feedback_id).push({
        id: m.id,
        sender_type: m.sender_type,
        text: m.text,
        seen_at: m.seen_at,
        created_at: m.created_at,
      });
    }
    return heads.rows.map(h => ({
      id: h.id,
      category: h.category,
      status: h.status,
      created_at: h.created_at,
      updated_at: h.updated_at,
      messages: byThread.get(h.id) || [],
    }));
  });

  // POST /feedback/mark-seen — пометить непросмотренные admin-сообщения как просмотренные
  fastify.post('/feedback/mark-seen', {
    preHandler: authenticate,
    config: { rateLimit: FEEDBACK_STATE_RATE_LIMIT }
  }, async (req) => {
    await db.query(
      `UPDATE feedback_thread_messages m
          SET seen_at = now()
         FROM feedback_messages f
        WHERE m.feedback_id = f.id
          AND f.user_id = $1
          AND f.user_deleted_at IS NULL
          AND m.sender_type = 'admin'
          AND m.seen_at IS NULL`,
      [req.user.sub]
    );
    return { ok: true };
  });

  // DELETE /feedback/:id — soft-delete на стороне пользователя
  // В БД запись остаётся (user_deleted_at), админ продолжает её видеть
  fastify.delete('/feedback/:id', {
    preHandler: authenticate,
    config: { rateLimit: FEEDBACK_STATE_RATE_LIMIT }
  }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Некорректный id' });
    const result = await db.query(
      'UPDATE feedback_messages SET user_deleted_at=now(), updated_at=now() WHERE id=$1 AND user_id=$2 AND user_deleted_at IS NULL RETURNING id',
      [id, req.user.sub]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Обращение не найдено' });
    return { ok: true };
  });

  // Хелпер: подгрузить один тред владельца (используется как ответ POST-эндпоинтов)
  async function loadFeedbackThread(id, userId) {
    const head = await db.query(
      `SELECT id, category, status, created_at, updated_at
         FROM feedback_messages WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    if (!head.rows.length) return null;
    const msgs = await db.query(
      `SELECT id, sender_type, text, seen_at, created_at
         FROM feedback_thread_messages
        WHERE feedback_id=$1
        ORDER BY created_at ASC, id ASC`,
      [id]
    );
    return { ...head.rows[0], messages: msgs.rows };
  }
}

module.exports = subscriptionRoutes;
