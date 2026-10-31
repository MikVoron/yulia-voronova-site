const crypto = require('crypto');
const { resolveOAuthAccount } = require('../oauth-accounts');
const { generateRefreshToken } = require('../auth');
const { issueRefreshSession } = require('../refresh-sessions');
const { sendWelcome, sendNewUserNotification } = require('../email');
const { tryGrantTrial } = require('../trial-guard');
const { reportTrialSignals } = require('../trial-monitor');
const audit = require('../audit');

// ── VK ID ───────────────────────────────────────────────────────────────────

const VK_APP_ID = process.env.VK_APP_ID;
const VK_REDIRECT = process.env.VK_REDIRECT || 'https://api.voronova.online/auth/oauth/vk/callback';
const VK_ID_URL = 'https://id.vk.ru';
const VK_PKCE_COOKIE = 'oauth_pkce_vk';
const VK_CALLBACK_PATH = '/auth/oauth/vk/callback';

// ── Yandex ID ───────────────────────────────────────────────────────────────

const YANDEX_CLIENT_ID = process.env.YANDEX_CLIENT_ID;
const YANDEX_CLIENT_SECRET = process.env.YANDEX_CLIENT_SECRET;
const YANDEX_REDIRECT = process.env.YANDEX_REDIRECT || 'https://api.voronova.online/auth/oauth/yandex/callback';

const PLATFORM_URL = process.env.PLATFORM_URL || 'https://plate.voronova.online';

// ── Helpers ─────────────────────────────────────────────────────────────────

function envFlagEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function providerReady(provider) {
  if (provider === 'vk') {
    return envFlagEnabled(process.env.VK_OAUTH_ENABLED) && Boolean(VK_APP_ID);
  }
  if (provider === 'yandex') {
    return envFlagEnabled(process.env.YANDEX_OAUTH_ENABLED) && Boolean(YANDEX_CLIENT_ID && YANDEX_CLIENT_SECRET);
  }
  return false;
}

function vkOneTapReady() {
  return providerReady('vk') && envFlagEnabled(process.env.VK_ONETAP_ENABLED);
}

function disabledProviderReply(reply) {
  return reply.status(404).send({ error: 'Способ входа недоступен' });
}

function browserFingerprint(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

function rememberFingerprint(provider, req, reply) {
  const options = { path: '/auth/oauth/' + provider + '/callback', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 };
  const fingerprint = browserFingerprint(req.query.fingerprint);
  if (fingerprint) reply.setCookie('oauth_fp_' + provider, fingerprint, options);
  else reply.clearCookie('oauth_fp_' + provider, { path: options.path });
}

function consumeFingerprint(provider, req, reply) {
  const fingerprint = browserFingerprint(req.cookies['oauth_fp_' + provider]);
  reply.clearCookie('oauth_fp_' + provider, { path: '/auth/oauth/' + provider + '/callback' });
  return fingerprint;
}

function setCookieAndRedirect(reply, refreshToken, isNew) {
  reply.setCookie('refreshToken', refreshToken, {
    path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000
  });
  const target = PLATFORM_URL + '/auth-callback.html' + (isNew ? '?welcome=1' : '');
  return reply.redirect(target);
}

async function findOrCreateUser(provider, providerId, email, displayName, emailVerified, fastify, ip, ua, fingerprint) {
  const { user, isNew } = await resolveOAuthAccount(provider, providerId, email, displayName, emailVerified);
  if (!isNew) return { user, isNew };
  email = user.email;
  // Keep the audit trail in the same order as the account lifecycle.
  await audit.log('register', { userId: user.id, email, detail: provider, ip });
  // Атомарная проверка + fingerprint + subscription — всё в одной транзакции
  const trial = await tryGrantTrial(fingerprint, ip, user.id);
  if (trial.grant) {
    await audit.log('trial_granted', { userId: user.id, email, detail: provider, ip });
  } else {
    await audit.log('trial_denied', { userId: user.id, email, detail: trial.reason + ' (' + provider + ')', ip });
  }
  reportTrialSignals({
    trial,
    userId: user.id,
    email,
    method: provider,
    ip,
    ua,
    fastify,
    fingerprintStatus: fingerprint ? 'valid' : 'missing'
  });
  if (email) {
    sendWelcome(email, trial.grant).catch(e => fastify.log.error(e, 'Welcome email error (OAuth)'));
  }
  sendNewUserNotification(
    { id: user.id, email: email || null },
    { method: provider, ip, userAgent: ua, trialGranted: trial.grant }
  ).catch(e => fastify.log.error(e, 'New user notification error (OAuth)'));

  return { user, isNew };
}

async function issueTokens(user, req, reply, isNew, fastify) {
  if (user.is_blocked) {
    audit.log('login_blocked', { userId: user.id, email: user.email, ip: req.ip });
    return reply.redirect(PLATFORM_URL + '/login.html?error=blocked');
  }
  if (user.role === 'admin') {
    audit.log('admin_oauth_denied', { userId: user.id, email: user.email, ip: req.ip, ua: req.headers['user-agent'] });
    return reply.redirect(PLATFORM_URL + '/login.html?error=admin_mfa_required');
  }
  const refreshToken = generateRefreshToken();
  const sessionId = await issueRefreshSession(user.id, refreshToken, req);
  await audit.log('login', {
    userId: user.id,
    email: user.email,
    detail: 'oauth',
    ip: req.ip,
    ua: req.headers['user-agent'],
    requestId: String(req.id),
    sessionId
  });
  return setCookieAndRedirect(reply, refreshToken, isNew);
}

// ── Routes ──────────────────────────────────────────────────────────────────

async function oauthRoutes(fastify) {

  // Public capability endpoint for the login page. A provider is exposed only
  // when both its explicit kill switch and all required credentials are set.
  fastify.get('/auth/oauth/providers', async () => ({
    vk: providerReady('vk'),
    yandex: providerReady('yandex'),
    vkOneTap: vkOneTapReady()
  }));

  // Only the public challenge reaches the SDK. The verifier remains HttpOnly.
  // A separate cookie for each attempt allows widgets in parallel tabs.
  fastify.get('/auth/oauth/vk/config', {
    // Public widget preparation is not a login attempt. Reloads and tabs must
    // not exhaust the stricter callback limit.
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    if (!vkOneTapReady()) return disabledProviderReply(reply);
    const state = crypto.randomBytes(24).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const fingerprint = browserFingerprint(req.query.fingerprint) || '';
    reply.setCookie('oauth_widget_vk_' + state, verifier + '.' + fingerprint, {
      path: VK_CALLBACK_PATH, httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600
    });
    reply.header('Cache-Control', 'no-store');
    return {
      appId: Number(VK_APP_ID), redirectUrl: VK_REDIRECT, state,
      codeChallenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      expiresIn: 600
    };
  });

  // ── VK: redirect ──
  fastify.get('/auth/oauth/vk', async (req, reply) => {
    if (!providerReady('vk')) return disabledProviderReply(reply);
    const service = req.query.provider;
    if (service !== undefined && !['mail_ru', 'ok_ru'].includes(service)) {
      return reply.code(400).send({ error: 'Unsupported login service' });
    }
    rememberFingerprint('vk', req, reply);
    const state = crypto.randomBytes(24).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    reply.setCookie('oauth_state_vk', state, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
    reply.setCookie(VK_PKCE_COOKIE, verifier, { path: VK_CALLBACK_PATH, httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
    const url = VK_ID_URL + '/authorize'
      + '?response_type=code'
      + '&client_id=' + VK_APP_ID
      + '&redirect_uri=' + encodeURIComponent(VK_REDIRECT)
      + '&scope=email'
      + '&code_challenge=' + challenge
      + '&code_challenge_method=s256'
      + '&state=' + state
      + (service ? '&provider=' + service + '&prompt=login' : '');
    return reply.redirect(url);
  });

  // ── VK: callback ──
  fastify.get('/auth/oauth/vk/callback', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
  }, async (req, reply) => {
    const { code, state, device_id: deviceId } = req.query;
    let expectedState = req.cookies.oauth_state_vk;
    let verifier = req.cookies[VK_PKCE_COOKIE];
    let fingerprint;
    const widgetName = typeof state === 'string' && /^[a-f0-9]{48}$/.test(state) ? 'oauth_widget_vk_' + state : null;
    const widgetContext = widgetName && req.cookies[widgetName];
    if (widgetContext) {
      const parts = widgetContext.split('.');
      verifier = parts.length === 2 ? parts[0] : null;
      fingerprint = browserFingerprint(parts[1]);
      expectedState = verifier && /^[A-Za-z0-9_-]{43}$/.test(verifier) ? state : null;
      reply.clearCookie(widgetName, { path: VK_CALLBACK_PATH });
    } else {
      fingerprint = consumeFingerprint('vk', req, reply);
      reply.clearCookie('oauth_state_vk', { path: '/' });
      reply.clearCookie(VK_PKCE_COOKIE, { path: VK_CALLBACK_PATH });
    }
    if (!code) return reply.redirect(PLATFORM_URL + '/login.html?error=no_code');
    if (!state || !expectedState || state !== expectedState) {
      return reply.redirect(PLATFORM_URL + '/login.html?error=invalid_state');
    }
    if (!providerReady('vk')) return disabledProviderReply(reply);
    if (widgetContext && !vkOneTapReady()) return disabledProviderReply(reply);
    if (typeof code !== 'string' || typeof deviceId !== 'string' || !deviceId
      || typeof verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
      return reply.redirect(PLATFORM_URL + '/login.html?error=vk_parameters');
    }

    try {
      // Exchange code for token
      const tokenRes = await fetch(VK_ID_URL + '/oauth2/auth', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: VK_APP_ID,
          redirect_uri: VK_REDIRECT,
          code_verifier: verifier,
          device_id: deviceId,
          state
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || typeof tokenData?.access_token !== 'string' || !tokenData.access_token || tokenData.state !== state) {
        fastify.log.error('VK token exchange failed or state did not match');
        return reply.redirect(PLATFORM_URL + '/login.html?error=vk_token');
      }

      // Get user info
      const userRes = await fetch(VK_ID_URL + '/oauth2/user_info', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          access_token: tokenData.access_token,
          client_id: VK_APP_ID
        })
      });
      const userData = await userRes.json();
      const user = userData?.user || userData;

      const vkId = String(user?.user_id || user?.id);
      if (!userRes.ok || !/^[1-9][0-9]*$/.test(vkId)) {
        return reply.redirect(PLATFORM_URL + '/login.html?error=vk_profile');
      }
      const email = user.email || tokenData.email || null;
      const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;

      const { user: dbUser, isNew } = await findOrCreateUser('vk', vkId, email, displayName, Boolean(email), fastify, req.ip, req.headers['user-agent'], fingerprint);
      return issueTokens(dbUser, req, reply, isNew, fastify);
    } catch (e) {
      if (e.code === 'OAUTH_EMAIL_REQUIRED') return reply.redirect(PLATFORM_URL + '/login.html?error=oauth_email_required');
      if (e.code === 'OAUTH_ACCOUNT_BLOCKED') return reply.redirect(PLATFORM_URL + '/login.html?error=blocked');
      if (e.code === 'ADMIN_OAUTH_LINK_DENIED') return reply.redirect(PLATFORM_URL + '/login.html?error=admin_mfa_required');
      fastify.log.error(e, 'VK OAuth error');
      return reply.redirect(PLATFORM_URL + '/login.html?error=vk_fail');
    }
  });

  // ── Yandex: redirect ──
  fastify.get('/auth/oauth/yandex', async (req, reply) => {
    if (!providerReady('yandex')) return disabledProviderReply(reply);
    rememberFingerprint('yandex', req, reply);
    const state = crypto.randomBytes(24).toString('hex');
    reply.setCookie('oauth_state_yandex', state, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
    const url = 'https://oauth.yandex.ru/authorize'
      + '?response_type=code'
      + '&client_id=' + YANDEX_CLIENT_ID
      + '&redirect_uri=' + encodeURIComponent(YANDEX_REDIRECT)
      + '&force_confirm=yes'
      + '&state=' + state;
    return reply.redirect(url);
  });

  // ── Yandex: callback ──
  fastify.get('/auth/oauth/yandex/callback', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
  }, async (req, reply) => {
    const { code, state } = req.query;
    const expectedState = req.cookies.oauth_state_yandex;
    const fingerprint = consumeFingerprint('yandex', req, reply);
    reply.clearCookie('oauth_state_yandex', { path: '/' });
    if (!code) return reply.redirect(PLATFORM_URL + '/login.html?error=no_code');
    if (!state || !expectedState || state !== expectedState) {
      return reply.redirect(PLATFORM_URL + '/login.html?error=invalid_state');
    }
    if (!providerReady('yandex')) return disabledProviderReply(reply);
    if (typeof code !== 'string') {
      return reply.redirect(PLATFORM_URL + '/login.html?error=yandex_parameters');
    }

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://oauth.yandex.ru/token', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: YANDEX_CLIENT_ID,
          client_secret: YANDEX_CLIENT_SECRET
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || typeof tokenData?.access_token !== 'string' || !tokenData.access_token) {
        fastify.log.error('Yandex token exchange failed');
        return reply.redirect(PLATFORM_URL + '/login.html?error=yandex_token');
      }

      // Get user info
      const userRes = await fetch('https://login.yandex.ru/info?format=json', {
        signal: AbortSignal.timeout(10000),
        headers: { 'Authorization': 'OAuth ' + tokenData.access_token }
      });
      const user = await userRes.json();

      const yandexId = String(user?.id);
      if (!userRes.ok || !/^[1-9][0-9]*$/.test(yandexId)) {
        return reply.redirect(PLATFORM_URL + '/login.html?error=yandex_profile');
      }
      const email = typeof user.default_email === 'string' ? user.default_email.trim().toLowerCase() : null;
      const displayName = typeof user.display_name === 'string' ? user.display_name
        : typeof user.real_name === 'string' ? user.real_name : null;

      const { user: dbUser, isNew } = await findOrCreateUser('yandex', yandexId, email, displayName, Boolean(email), fastify, req.ip, req.headers['user-agent'], fingerprint);
      return issueTokens(dbUser, req, reply, isNew, fastify);
    } catch (e) {
      if (e.code === 'OAUTH_EMAIL_REQUIRED') return reply.redirect(PLATFORM_URL + '/login.html?error=oauth_email_required');
      if (e.code === 'OAUTH_ACCOUNT_BLOCKED') return reply.redirect(PLATFORM_URL + '/login.html?error=blocked');
      if (e.code === 'ADMIN_OAUTH_LINK_DENIED') return reply.redirect(PLATFORM_URL + '/login.html?error=admin_mfa_required');
      fastify.log.error(e, 'Yandex OAuth error');
      return reply.redirect(PLATFORM_URL + '/login.html?error=yandex_fail');
    }
  });
}

module.exports = oauthRoutes;
