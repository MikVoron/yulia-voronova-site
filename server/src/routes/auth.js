const bcrypt = require('bcrypt');
const db = require('../db');
const { generateAccessToken, generateRefreshToken, hashToken, verifyAccessToken, generateLoginCode } = require('../auth');
const { issueRefreshSession } = require('../refresh-sessions');
const { sendLoginCode, sendWelcome, sendNewUserNotification } = require('../email');
const { authenticate } = require('../middleware');
const { tryGrantTrial } = require('../trial-guard');
const { inspectFingerprint, reportTrialSignals } = require('../trial-monitor');
const audit = require('../audit');
const { verifyTotp } = require('../totp');
const { queueMetrikaGoal, dispatchMetrikaGoals } = require('../metrika-conversions');

const AUTH_SEND_CODE_RATE_LIMIT = { max: 10, timeWindow: '15 minutes' };
const AUTH_VERIFY_RATE_LIMIT = { max: 20, timeWindow: '15 minutes' };
const AUTH_REFRESH_RATE_LIMIT = { max: 60, timeWindow: '15 minutes' };
const AUTH_LOGOUT_RATE_LIMIT = { max: 60, timeWindow: '15 minutes' };
const AUTH_PROFILE_RATE_LIMIT = { max: 20, timeWindow: '1 hour' };
const AUTH_ACTIVITY_RATE_LIMIT = { max: 120, timeWindow: '15 minutes' };
const LOGIN_CODE_TTL_MINUTES = 10;
const LOGIN_CODE_MAX_ATTEMPTS = 3;
const LOGIN_CODE_RESEND_SECONDS = 60;
const LOGIN_CODE_WINDOW_MS = 15 * 60 * 1000;

function retryDetails(deadline) {
  const now = Date.now();
  const retryAt = Math.max(now + 1000, deadline);
  return { retryAfterSeconds: Math.ceil((retryAt - now) / 1000), retryAt: new Date(retryAt).toISOString() };
}

function timeOr(value, fallback) {
  const time = value == null ? NaN : new Date(value).getTime();
  return Number.isFinite(time) ? time : fallback;
}

async function authRoutes(fastify) {
  function rejectCode(req, reply, status, reason, error, extra = {}) {
    // Keep diagnosis possible without recording email addresses or submitted codes.
    fastify.log.info({ event: 'auth_code_rejected', reason, requestId: String(req.id) }, 'Auth code rejected');
    if (extra.retryAfterSeconds) reply.header('Retry-After', String(extra.retryAfterSeconds));
    return reply.status(status).send({ error, reason, ...extra });
  }
  // POST /auth/send-code
  fastify.post('/auth/send-code', {
    config: { rateLimit: AUTH_SEND_CODE_RATE_LIMIT }
  }, async (req, reply) => {
    const { email, context, metrikaClientId } = req.body || {};
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return reply.status(400).send({ error: 'Некорректный email' });
    const lower = email.toLowerCase().trim();
    // Если вход через админку — проверяем что email принадлежит админу
    // Отвечаем 200 в любом случае, чтобы не раскрывать наличие/роль аккаунта
    if (context === 'admin') {
      const adminCheck = await db.query("SELECT role FROM users WHERE email=$1", [lower]);
      if (!adminCheck.rows.length || adminCheck.rows[0].role !== 'admin') {
        return reply.send({ ok: true });
      }
    }
    // rate limit по IP: макс 10 кодов за 15 минут с одного IP
    const ip = req.ip;
    const ipRecent = await db.query("SELECT COUNT(*) AS count, (array_agg(created_at ORDER BY created_at DESC))[10] AS limit_at, (array_agg(created_at ORDER BY created_at DESC))[9] AS next_limit_at FROM login_codes WHERE ip=$1 AND created_at > now() - interval '15 minutes'", [ip]);
    if (Number(ipRecent.rows[0].count) >= 10) return rejectCode(req, reply, 429, 'SEND_RATE_LIMIT', 'Слишком много запросов. Подождите перед отправкой нового письма', retryDetails(timeOr(ipRecent.rows[0].limit_at, Date.now()) + LOGIN_CODE_WINDOW_MS));
    // rate limit по email
    const recent = await db.query("SELECT COUNT(*) AS count, MAX(created_at) AS last_at, (array_agg(created_at ORDER BY created_at DESC))[3] AS limit_at, (array_agg(created_at ORDER BY created_at DESC))[2] AS next_limit_at FROM login_codes WHERE email=$1 AND created_at > now() - interval '15 minutes'", [lower]);
    if (Number(recent.rows[0].count) >= 3) return rejectCode(req, reply, 429, 'SEND_RATE_LIMIT', 'Слишком много попыток. Подождите перед отправкой нового письма', retryDetails(timeOr(recent.rows[0].limit_at, Date.now()) + LOGIN_CODE_WINDOW_MS));
    const lastSent = timeOr(recent.rows[0].last_at, 0);
    if (lastSent + LOGIN_CODE_RESEND_SECONDS * 1000 > Date.now()) return rejectCode(req, reply, 429, 'SEND_COOLDOWN', 'Письмо уже отправлено. Подождите перед повторной отправкой', retryDetails(lastSent + LOGIN_CODE_RESEND_SECONDS * 1000));
    const code = generateLoginCode();
    const codeHash = await bcrypt.hash(code, 10);
    const inserted = await db.query("INSERT INTO login_codes (email, code_hash, expires_at, ip) VALUES ($1, $2, now() + ($3 * interval '1 minute'), $4) RETURNING created_at, expires_at", [lower, codeHash, LOGIN_CODE_TTL_MINUTES, ip]);
    try { await sendLoginCode(lower, code, LOGIN_CODE_TTL_MINUTES); } catch (e) { fastify.log.error(e, 'SMTP error'); return reply.status(500).send({ error: 'Не удалось отправить письмо. Попробуйте чуть позже', reason: 'SEND_FAILED' }); }
    const sentAt = timeOr(inserted.rows[0]?.created_at, Date.now());
    const resendAt = Math.max(sentAt + LOGIN_CODE_RESEND_SECONDS * 1000,
      Number(recent.rows[0].count) >= 2 ? timeOr(recent.rows[0].next_limit_at, sentAt) + LOGIN_CODE_WINDOW_MS : 0,
      Number(ipRecent.rows[0].count) >= 9 ? timeOr(ipRecent.rows[0].next_limit_at, sentAt) + LOGIN_CODE_WINDOW_MS : 0);
    const metrikaGoals = {};
    if (context !== 'admin') {
      for (const goalId of ['registration_started', 'verification_code_sent']) {
        try { metrikaGoals[goalId] = await queueMetrikaGoal({ goalId, clientId: metrikaClientId, logger: fastify.log, requestId: String(req.id) }); }
        catch (e) { metrikaGoals[goalId] = false; fastify.log.error(e, 'Metrika goal queue error'); }
      }
      if (Object.values(metrikaGoals).some(Boolean)) dispatchMetrikaGoals(fastify);
    }
    return { ok: true, message: 'Код отправлен на ' + lower, metrikaGoals,
      serverTime: new Date().toISOString(),
      codeExpiresAt: new Date(timeOr(inserted.rows[0]?.expires_at, sentAt + LOGIN_CODE_TTL_MINUTES * 60000)).toISOString(),
      resendAvailableAt: new Date(resendAt).toISOString() };
  });

  // POST /auth/verify
  fastify.post('/auth/verify', {
    config: { rateLimit: AUTH_VERIFY_RATE_LIMIT }
  }, async (req, reply) => {
    const { email, code, fingerprint: rawFingerprint, context, mfaCode, metrikaClientId } = req.body || {};
    if (typeof email !== 'string' || !email || !code) return reply.status(400).send({ error: 'email и code обязательны' });
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return rejectCode(req, reply, 400, 'INVALID_CODE_FORMAT', 'Введите 6 цифр из письма');
    const lower = email.toLowerCase().trim();
    const fingerprintCheck = inspectFingerprint(rawFingerprint);
    if (fingerprintCheck.status === 'invalid') {
      audit.log('trial_fingerprint_invalid', {
        email: lower,
        detail: 'type=' + typeof rawFingerprint + ', length=' + (typeof rawFingerprint === 'string' ? rawFingerprint.length : 0),
        ip: req.ip,
        ua: req.headers['user-agent']
      });
      return reply.status(400).send({ error: 'Некорректный fingerprint' });
    }
    // rate limit по IP: макс 20 попыток верификации за 15 минут
    const ipVerify = await db.query("SELECT COALESCE(SUM(attempts), 0) AS total FROM login_codes WHERE ip=$1 AND created_at > now() - interval '15 minutes'", [req.ip]);
    if (Number(ipVerify.rows[0].total) >= 20) return rejectCode(req, reply, 429, 'VERIFY_RATE_LIMIT', 'Слишком много попыток проверки. Подождите 15 минут', retryDetails(Date.now() + LOGIN_CODE_WINDOW_MS));
    // Select the latest request even when it is consumed/expired. Never revive an older code.
    const result = await db.query('SELECT * FROM login_codes WHERE email=$1 ORDER BY created_at DESC, id DESC LIMIT 1', [lower]);
    if (!result.rows.length) return rejectCode(req, reply, 400, 'CODE_EXPIRED', 'Код не найден или истёк');
    const row = result.rows[0];
    if (row.used) return rejectCode(req, reply, 400, 'CODE_UNAVAILABLE', 'Код уже использован или недоступен. Запросите новый код');
    if (timeOr(row.expires_at, Infinity) <= Date.now()) return rejectCode(req, reply, 400, 'CODE_EXPIRED', 'Срок действия кода закончился. Получите новый код');
    if (Number(row.attempts || 0) >= LOGIN_CODE_MAX_ATTEMPTS) {
      await db.query('UPDATE login_codes SET used=true WHERE id=$1 AND used=false', [row.id]);
      return rejectCode(req, reply, 400, 'CODE_ATTEMPTS_EXCEEDED', 'Превышено число попыток. Получите новый код', { attemptsRemaining: 0 });
    }
    const valid = await bcrypt.compare(code, row.code_hash);
    if (!valid) {
      const failed = await db.query(
        'UPDATE login_codes SET attempts=COALESCE(attempts, 0)+1 WHERE id=$1 AND used=false AND COALESCE(attempts, 0) < $2 RETURNING attempts',
        [row.id, LOGIN_CODE_MAX_ATTEMPTS]
      );
      const remaining = Math.max(0, LOGIN_CODE_MAX_ATTEMPTS - Number(failed.rows[0]?.attempts ?? (Number(row.attempts || 0) + 1)));
      return rejectCode(req, reply, 400, remaining ? 'INVALID_CODE' : 'CODE_ATTEMPTS_EXCEEDED', remaining ? 'Неверный код' : 'Превышено число попыток. Получите новый код', { attemptsRemaining: remaining });
    }
    // Сначала определяем роль: для администратора email-код сам по себе недостаточен.
    let userRes = await db.query('SELECT * FROM users WHERE email=$1', [lower]);
    const existingUser = userRes.rows[0] || null;
    if (existingUser?.role === 'admin') {
      const mfaSecret = process.env.ADMIN_TOTP_SECRET;
      if (!mfaSecret) {
        fastify.log.error('ADMIN_TOTP_SECRET is missing; admin login denied');
        return reply.status(503).send({ error: 'Вход администратора временно недоступен' });
      }
      if (context !== 'admin' || !verifyTotp(mfaCode, mfaSecret)) {
        const failedAttempt = await db.query(
          `UPDATE login_codes
              SET attempts=COALESCE(attempts, 0)+1,
                  used=CASE WHEN COALESCE(attempts, 0) + 1 >= $2 THEN true ELSE used END
            WHERE id=$1 AND used=false
            RETURNING attempts, used`,
          [row.id, LOGIN_CODE_MAX_ATTEMPTS]
        );
        const attemptState = failedAttempt.rows[0] || null;
        await audit.log('admin_mfa_failed', {
          userId: existingUser.id,
          email: lower,
          detail: attemptState ? 'attempts=' + attemptState.attempts + '; locked=' + attemptState.used : 'code_unavailable',
          ip: req.ip,
          ua: req.headers['user-agent']
        });
        if (!attemptState) {
          return rejectCode(req, reply, 400, 'CODE_UNAVAILABLE', 'Код уже использован или истёк');
        }
        if (attemptState.used) {
          return rejectCode(req, reply, 429, 'MFA_ATTEMPTS_EXCEEDED', 'Превышено число попыток MFA. Запросите новый email-код.');
        }
        // До исчерпания лимита email-код остаётся действительным, чтобы можно
        // было исправить случайную ошибку TOTP без повторной отправки письма.
        return rejectCode(req, reply, 403, 'MFA_INVALID', 'Неверный код приложения-аутентификатора', { mfaRequired: true });
      }
    }
    const consumed = await db.query(
      `UPDATE login_codes SET used=true WHERE id=$1 AND used=false AND expires_at > now()
         AND COALESCE(attempts, 0) < $2
         AND NOT EXISTS (SELECT 1 FROM login_codes newer
                          WHERE newer.email=login_codes.email
                            AND (newer.created_at, newer.id) > (login_codes.created_at, login_codes.id))
       RETURNING id`,
      [row.id, LOGIN_CODE_MAX_ATTEMPTS]
    );
    if (!consumed.rows.length) return rejectCode(req, reply, 400, 'CODE_UNAVAILABLE', 'Код уже использован, истёк или заменён новым');

    // найти или создать пользователя
    let isNew = false;
    let registrationGoalQueued = false;
    if (!userRes.rows.length) {
      isNew = true;
      const fingerprint = fingerprintCheck.value;
      userRes = await db.query('INSERT INTO users (email) VALUES ($1) RETURNING *', [lower]);
      const userId = userRes.rows[0].id;
      await db.query('INSERT INTO auth_accounts (user_id, provider, provider_id) VALUES ($1, $2, $3)', [userId, 'email', lower]);
      try {
        registrationGoalQueued = await queueMetrikaGoal({
          goalId: 'registration_completed', userId, clientId: metrikaClientId,
          logger: fastify.log, requestId: String(req.id)
        });
      } catch (e) {
        fastify.log.error(e, 'Metrika registration goal queue error');
      }
      // Keep the audit trail in the same order as the account lifecycle.
      await audit.log('register', { userId, email: lower, detail: 'email', ip: req.ip, ua: req.headers['user-agent'] });
      // Атомарная проверка + fingerprint + subscription — всё в одной транзакции
      const trial = await tryGrantTrial(fingerprint, req.ip, userId);
      if (trial.grant) {
        await audit.log('trial_granted', {
          userId,
          email: lower,
          detail: trial.reason === 'fingerprint_seen_other_network' ? trial.reason : null,
          ip: req.ip,
          ua: req.headers['user-agent']
        });
      } else {
        await audit.log('trial_denied', { userId, email: lower, detail: trial.reason, ip: req.ip, ua: req.headers['user-agent'] });
      }
      reportTrialSignals({
        trial,
        userId,
        email: lower,
        method: 'email',
        ip: req.ip,
        ua: req.headers['user-agent'],
        fastify,
        fingerprintStatus: fingerprintCheck.status
      });
      sendWelcome(lower, trial.grant).catch(e => fastify.log.error(e, 'Welcome email error'));
      sendNewUserNotification(
        { id: userId, email: lower },
        { method: 'email', ip: req.ip, userAgent: req.headers['user-agent'], trialGranted: trial.grant }
      ).catch(e => fastify.log.error(e, 'New user notification error'));
    }
    const user = userRes.rows[0];
    if (user.is_blocked) {
      audit.log('login_blocked', { userId: user.id, email: lower, ip: req.ip, ua: req.headers['user-agent'] });
      return reply.status(403).send({ error: 'Аккаунт заблокирован' });
    }
    const refreshToken = generateRefreshToken();
    const isAdminSession = user.role === 'admin';
    const sessionId = await issueRefreshSession(user.id, refreshToken, req, { admin: isAdminSession });
    await audit.log('login', {
      userId: user.id,
      email: lower,
      ip: req.ip,
      ua: req.headers['user-agent'],
      requestId: String(req.id),
      sessionId
    });
    const accessToken = generateAccessToken(user, sessionId);
    reply.setCookie('refreshToken', refreshToken, {
      path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: isAdminSession ? 43200 : 2592000
    });
    if (registrationGoalQueued) dispatchMetrikaGoals(fastify);
    return { accessToken, user: { id: user.id, email: user.email, displayName: user.display_name, avatar: user.avatar || null, weight: user.weight_kg == null ? null : Number(user.weight_kg), role: user.role, createdAt: user.created_at }, isNew, metrikaGoals: { registration_completed: registrationGoalQueued } };
  });

  // POST /auth/refresh
  fastify.post('/auth/refresh', {
    config: { rateLimit: AUTH_REFRESH_RATE_LIMIT }
  }, async (req, reply) => {

    const token = req.cookies.refreshToken;
    if (!token) return reply.status(401).send({ error: 'Нет refresh токена' });
    const tokenHash = hashToken(token);
    const newRefresh = generateRefreshToken();
    const newRefreshHash = hashToken(newRefresh);
    const result = await db.query(
      `WITH consumed AS (
         DELETE FROM refresh_sessions rs
          USING users u
          WHERE rs.user_id=u.id
            AND rs.refresh_token_hash=$1
            AND rs.expires_at > now()
          RETURNING rs.user_id, rs.session_id, u.email, u.role, u.display_name, u.avatar, u.weight_kg,
                    u.is_blocked, u.created_at AS user_created_at
       ), inserted AS (
         INSERT INTO refresh_sessions (user_id, refresh_token_hash, ua, ip, expires_at, session_id)
         SELECT user_id, $2, $3, $4,
                now() + CASE WHEN role='admin' THEN interval '12 hours' ELSE interval '30 days' END,
                session_id
           FROM consumed
          WHERE is_blocked=false
         RETURNING user_id
       )
       SELECT consumed.* FROM consumed`,
      [tokenHash, newRefreshHash, req.headers['user-agent'] || '', req.ip]
    );
    if (!result.rows.length) {
      // Do not clear the cookie here: another tab may have just rotated the
      // same refresh token and set a newer cookie in the browser.
      return reply.status(401).send({ error: 'Сессия истекла' });
    }
    const session = result.rows[0];
    if (session.is_blocked) return reply.status(403).send({ error: 'Аккаунт заблокирован' });
    await db.query(
      `DELETE FROM refresh_sessions
        WHERE id IN (
          SELECT id FROM refresh_sessions WHERE user_id=$1
           ORDER BY expires_at DESC, id DESC OFFSET 10
        )`,
      [session.user_id]
    );
    const accessToken = generateAccessToken(
      { id: session.user_id, email: session.email, role: session.role },
      session.session_id
    );
    reply.setCookie('refreshToken', newRefresh, {
      path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: session.role === 'admin' ? 43200 : 2592000
    });
    return { accessToken, user: { id: session.user_id, email: session.email, displayName: session.display_name, avatar: session.avatar || null, weight: session.weight_kg == null ? null : Number(session.weight_kg), role: session.role, createdAt: session.user_created_at } };
  });

  // POST /auth/logout
  fastify.post('/auth/logout', {
    config: { rateLimit: AUTH_LOGOUT_RATE_LIMIT }
  }, async (req, reply) => {
    const token = req.cookies.refreshToken;
    if (token) {
      await db.query('DELETE FROM refresh_sessions WHERE refresh_token_hash=$1', [hashToken(token)]);
    }
    reply.clearCookie('refreshToken', { path: '/' });
    return { ok: true };
  });

  // GET /auth/me
  fastify.get('/auth/me', async (req, reply) => {

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return reply.status(401).send({ error: 'Не авторизован' });
    try {
      const payload = verifyAccessToken(auth.slice(7));
      const result = await db.query(
        `SELECT u.*, s.status as sub_status, s.trial_ends_at, s.active_until,
                (s.status = 'expired'
                  AND s.trial_ends_at IS NOT NULL
                  AND s.created_at IS NOT NULL
                  AND s.trial_ends_at <= s.created_at + interval '1 minute') AS trial_not_granted
           FROM users u
           LEFT JOIN subscriptions s ON s.user_id=u.id
          WHERE u.id=$1`,
        [payload.sub]
      );
      if (!result.rows.length) return reply.status(401).send({ error: 'Пользователь не найден' });
      const u = result.rows[0];
      // Fallback: если cron не обновил статус — проверяем даты (не для админов)
      let status = u.sub_status;
      if (u.role !== 'admin') {
        if (status === 'trial' && u.trial_ends_at && new Date(u.trial_ends_at) < new Date()) {
          status = 'expired';
          db.query("UPDATE subscriptions SET status='expired' WHERE user_id=$1 AND status='trial'", [u.id]).catch(() => {});
        } else if (status === 'active' && u.active_until && new Date(u.active_until) < new Date()) {
          status = 'expired';
          db.query("UPDATE subscriptions SET status='expired' WHERE user_id=$1 AND status='active'", [u.id]).catch(() => {});
        }
      }
      return {
        id: u.id, email: u.email, displayName: u.display_name, avatar: u.avatar || null, weight: u.weight_kg == null ? null : Number(u.weight_kg), role: u.role, createdAt: u.created_at,
        subscription: {
          status,
          trialEndsAt: u.trial_ends_at,
          activeUntil: u.active_until,
          trialNotGranted: u.trial_not_granted === true,
          isEarlyBird: u.early_access_member === true
        }
      };
    } catch (e) {
      return reply.status(401).send({ error: 'Токен невалиден' });
    }
  });

  // POST /auth/activity — один факт посещения в календарный день по Москве.
  // Не считаем автоматическое обновление токена: клиент вызывает этот endpoint
  // только после успешной проверки доступа при открытии платформы.
  fastify.post('/auth/activity', {
    preHandler: authenticate,
    config: { rateLimit: AUTH_ACTIVITY_RATE_LIMIT }
  }, async (req, reply) => {
    await db.query(
      `WITH visit_lock AS (
         SELECT pg_advisory_xact_lock(hashtext($1::text || ':platform_visit:' || (now() AT TIME ZONE 'Europe/Moscow')::date::text))
       )
       INSERT INTO audit_log (user_id, email, event, detail, ip, ua)
       SELECT u.id, u.email, 'platform_visit', NULL, $2, $3
       FROM users u
       CROSS JOIN visit_lock
       WHERE u.id=$1::uuid
         AND NOT EXISTS (
           SELECT 1
           FROM audit_log a
           WHERE a.user_id=u.id
             AND a.event='platform_visit'
             AND a.created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')
         )`,
      [req.user.sub, req.ip, req.headers['user-agent'] || '']
    );
    return reply.code(204).send();
  });

  // PUT /auth/profile — обновить display_name, avatar и/или weight
  fastify.put('/auth/profile', {
    preHandler: authenticate,
    config: { rateLimit: AUTH_PROFILE_RATE_LIMIT }
  }, async (req, reply) => {

    const { displayName, avatar, weight } = req.body || {};
    let name = undefined;
    if (displayName !== undefined) {
      if (displayName == null || displayName === '') {
        name = null;
      } else if (typeof displayName !== 'string') {
        return reply.status(400).send({ error: 'Некорректное имя' });
      } else {
        const trimmed = displayName.trim();
        name = trimmed ? trimmed.slice(0, 100) : null;
      }
    }

    let ava = undefined;
    if (avatar !== undefined) {
      if (avatar == null || avatar === '') {
        ava = null; // сброс аватара
      } else if (typeof avatar !== 'string') {
        return reply.status(400).send({ error: 'Некорректный аватар' });
      } else {
        if (avatar.length > 320 * 1024) return reply.status(400).send({ error: 'Аватар слишком большой. Максимум 220 КБ' });
        const match = avatar.match(/^data:image\/(png|jpeg|webp|gif);base64,(.+)$/);
        if (!match) return reply.status(400).send({ error: 'Недопустимый формат аватара. Разрешены PNG, JPEG, WebP, GIF' });
        let decoded;
        try { decoded = Buffer.from(match[2], 'base64'); } catch { return reply.status(400).send({ error: 'Некорректный base64 в аватаре' }); }
        if (decoded.length > 220 * 1024) return reply.status(400).send({ error: 'Аватар слишком большой. Максимум 220 КБ' });
        ava = avatar;
      }
    }

    let weightKg = undefined;
    if (weight !== undefined) {
      if (weight === null || weight === '') {
        weightKg = null;
      } else if (typeof weight !== 'number' || !Number.isFinite(weight)
        || weight < 30 || weight > 300 || !Number.isInteger(weight * 2)) {
        return reply.status(400).send({ error: 'Вес должен быть от 30 до 300 кг с шагом 0,5 кг' });
      } else {
        weightKg = weight;
      }
    }

    const sets = [];
    const vals = [];
    let idx = 1;
    if (name !== undefined) { sets.push('display_name=$' + idx++); vals.push(name); }
    if (ava !== undefined) { sets.push('avatar=$' + idx++); vals.push(ava); }
    if (weightKg !== undefined) { sets.push('weight_kg=$' + idx++); vals.push(weightKg); }
    if (!sets.length) return reply.status(400).send({ error: 'Нет данных' });
    vals.push(req.user.sub);
    await db.query('UPDATE users SET ' + sets.join(', ') + ' WHERE id=$' + idx, vals);
    return { ok: true, displayName: name !== undefined ? name : null, avatar: ava !== undefined ? ava : null, weight: weightKg !== undefined ? weightKg : null };
  });
}

module.exports = authRoutes;
