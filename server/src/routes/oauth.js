const db = require('../db');
const { generateAccessToken, generateRefreshToken, hashToken } = require('../auth');
const { sendWelcome } = require('../email');
const { shouldGrantTrial, recordTrial } = require('../trial-guard');

// ── VK ID ───────────────────────────────────────────────────────────────────

const VK_APP_ID = process.env.VK_APP_ID;
const VK_APP_SECRET = process.env.VK_APP_SECRET;
const VK_REDIRECT = process.env.VK_REDIRECT || 'https://api.voronova.online/auth/oauth/vk/callback';

// ── Yandex ID ───────────────────────────────────────────────────────────────

const YANDEX_CLIENT_ID = process.env.YANDEX_CLIENT_ID;
const YANDEX_CLIENT_SECRET = process.env.YANDEX_CLIENT_SECRET;
const YANDEX_REDIRECT = process.env.YANDEX_REDIRECT || 'https://api.voronova.online/auth/oauth/yandex/callback';

// ── Helpers ─────────────────────────────────────────────────────────────────

function setCookieAndRedirect(reply, refreshToken, isNew) {
  reply.setCookie('refreshToken', refreshToken, {
    path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000
  });
  const target = 'https://voronova.online/platform/auth-callback.html' + (isNew ? '?welcome=1' : '');
  return reply.redirect(target);
}

async function findOrCreateUser(provider, providerId, email, displayName, fastify, ip) {
  let isNew = false;

  // 1. Ищем существующий auth_account
  const existing = await db.query(
    'SELECT u.* FROM auth_accounts aa JOIN users u ON u.id=aa.user_id WHERE aa.provider=$1 AND aa.provider_id=$2',
    [provider, providerId]
  );
  if (existing.rows.length) {
    return { user: existing.rows[0], isNew };
  }

  // 2. Если провайдер вернул email — ищем user по email (линковка)
  let user = null;
  if (email) {
    const byEmail = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    if (byEmail.rows.length) {
      user = byEmail.rows[0];
      // Привязываем новый auth_account к существующему user
      await db.query(
        'INSERT INTO auth_accounts (user_id, provider, provider_id) VALUES ($1, $2, $3)',
        [user.id, provider, providerId]
      );
      return { user, isNew };
    }
  }

  // 3. Новый пользователь
  isNew = true;
  const insertRes = await db.query(
    'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING *',
    [email || null, displayName || null]
  );
  user = insertRes.rows[0];
  await db.query(
    'INSERT INTO auth_accounts (user_id, provider, provider_id) VALUES ($1, $2, $3)',
    [user.id, provider, providerId]
  );
  // Проверка: давать ли триал (OAuth — только по IP, fingerprint недоступен)
  const trial = await shouldGrantTrial(null, ip);
  if (trial.grant) {
    await db.query("INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip) VALUES ($1, 'trial', now() + interval '7 days', $2)", [user.id, ip]);
    await recordTrial(null, ip, user.id);
  } else {
    await db.query("INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip) VALUES ($1, 'expired', now(), $2)", [user.id, ip]);
  }
  if (email) {
    sendWelcome(email).catch(e => fastify.log.error(e, 'Welcome email error (OAuth)'));
  }

  return { user, isNew };
}

async function issueTokens(user, req, reply, isNew, fastify) {
  if (user.is_blocked) {
    return reply.redirect('https://voronova.online/platform/login.html?error=blocked');
  }
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  await db.query(
    "INSERT INTO refresh_sessions (user_id, refresh_token_hash, ua, ip, expires_at) VALUES ($1,$2,$3,$4, now() + interval '30 days')",
    [user.id, hashToken(refreshToken), req.headers['user-agent'] || '', req.ip]
  );
  return setCookieAndRedirect(reply, refreshToken, isNew);
}

// ── Routes ──────────────────────────────────────────────────────────────────

async function oauthRoutes(fastify) {

  // ── VK: redirect ──
  fastify.get('/auth/oauth/vk', async (req, reply) => {
    if (!VK_APP_ID) return reply.status(500).send({ error: 'VK OAuth не настроен' });
    const url = 'https://id.vk.com/authorize'
      + '?response_type=code'
      + '&client_id=' + VK_APP_ID
      + '&redirect_uri=' + encodeURIComponent(VK_REDIRECT)
      + '&scope=email'
      + '&state=vk';
    return reply.redirect(url);
  });

  // ── VK: callback ──
  fastify.get('/auth/oauth/vk/callback', async (req, reply) => {
    const { code } = req.query;
    if (!code) return reply.redirect('https://voronova.online/platform/login.html?error=no_code');

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://id.vk.com/oauth2/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: VK_APP_ID,
          client_secret: VK_APP_SECRET,
          redirect_uri: VK_REDIRECT,
          code_verifier: ''
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        fastify.log.error(tokenData, 'VK token exchange failed');
        return reply.redirect('https://voronova.online/platform/login.html?error=vk_token');
      }

      // Get user info
      const userRes = await fetch('https://id.vk.com/oauth2/user_info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          access_token: tokenData.access_token,
          client_id: VK_APP_ID
        })
      });
      const userData = await userRes.json();
      const user = userData.user || userData;

      const vkId = String(user.user_id || user.id);
      const email = user.email || tokenData.email || null;
      const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;

      const { user: dbUser, isNew } = await findOrCreateUser('vk', vkId, email, displayName, fastify, req.ip);
      return issueTokens(dbUser, req, reply, isNew, fastify);
    } catch (e) {
      fastify.log.error(e, 'VK OAuth error');
      return reply.redirect('https://voronova.online/platform/login.html?error=vk_fail');
    }
  });

  // ── Yandex: redirect ──
  fastify.get('/auth/oauth/yandex', async (req, reply) => {
    if (!YANDEX_CLIENT_ID) return reply.status(500).send({ error: 'Yandex OAuth не настроен' });
    const url = 'https://oauth.yandex.ru/authorize'
      + '?response_type=code'
      + '&client_id=' + YANDEX_CLIENT_ID
      + '&redirect_uri=' + encodeURIComponent(YANDEX_REDIRECT)
      + '&force_confirm=yes';
    return reply.redirect(url);
  });

  // ── Yandex: callback ──
  fastify.get('/auth/oauth/yandex/callback', async (req, reply) => {
    const { code } = req.query;
    if (!code) return reply.redirect('https://voronova.online/platform/login.html?error=no_code');

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://oauth.yandex.ru/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: YANDEX_CLIENT_ID,
          client_secret: YANDEX_CLIENT_SECRET
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        fastify.log.error(tokenData, 'Yandex token exchange failed');
        return reply.redirect('https://voronova.online/platform/login.html?error=yandex_token');
      }

      // Get user info
      const userRes = await fetch('https://login.yandex.ru/info?format=json', {
        headers: { 'Authorization': 'OAuth ' + tokenData.access_token }
      });
      const user = await userRes.json();

      const yandexId = String(user.id);
      const email = user.default_email || null;
      const displayName = user.display_name || user.real_name || null;

      const { user: dbUser, isNew } = await findOrCreateUser('yandex', yandexId, email, displayName, fastify, req.ip);
      return issueTokens(dbUser, req, reply, isNew, fastify);
    } catch (e) {
      fastify.log.error(e, 'Yandex OAuth error');
      return reply.redirect('https://voronova.online/platform/login.html?error=yandex_fail');
    }
  });
}

module.exports = oauthRoutes;
