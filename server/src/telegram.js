const os = require('os');
const db = require('./db');

const DEFAULT_ALERT_INTERVAL_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_SECONDS = 20;

let polling = false;
let stopped = false;
let pollTimer = null;
let updateOffset = 0;
const lastAlerts = new Map();

function getConfig() {
  return {
    token: process.env.TG_BOT_TOKEN || '',
    chatId: process.env.TG_CHAT_ID || '',
    enabled: !!process.env.TG_BOT_TOKEN && !!process.env.TG_CHAT_ID,
    pollEnabled: process.env.TG_BOT_POLLING !== 'false',
    alertMinIntervalMs: Number(process.env.TG_ALERT_MIN_INTERVAL_MS) || DEFAULT_ALERT_INTERVAL_MS
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(value, max = 600) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max - 1) + '...' : text;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function telegramRequest(method, payload, timeoutMs = 12000) {
  const { token, enabled } = getConfig();
  if (!enabled || typeof fetch !== 'function') return { ok: false, skipped: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const message = data.description || `Telegram API HTTP ${response.status}`;
      throw new Error(message);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function sendTelegramMessage(text, options = {}) {
  const { chatId } = getConfig();
  if (!chatId) return false;
  await telegramRequest('sendMessage', {
    chat_id: options.chatId || chatId,
    text,
    parse_mode: options.parseMode || 'HTML',
    disable_web_page_preview: true
  });
  return true;
}

async function sendTelegramAlert(text, options = {}) {
  const { enabled, alertMinIntervalMs } = getConfig();
  if (!enabled) return false;

  const key = options.key || truncate(text, 120);
  const minIntervalMs = options.minIntervalMs ?? alertMinIntervalMs;
  const now = Date.now();
  const last = lastAlerts.get(key) || 0;
  if (minIntervalMs > 0 && now - last < minIntervalMs) return false;
  lastAlerts.set(key, now);

  const title = options.title || 'SmartPlate alert';
  const body = `<b>${escapeHtml(title)}</b>\n${escapeHtml(truncate(text, 3000))}`;
  try {
    await sendTelegramMessage(body);
    return true;
  } catch (error) {
    if (options.fastify) {
      options.fastify.log.error(error, 'Telegram alert failed');
    }
    return false;
  }
}

async function optionalCount(sql) {
  try {
    const result = await db.query(sql);
    return Number(result.rows[0]?.count || 0);
  } catch (_) {
    return null;
  }
}

async function getSubscriptionSummary() {
  try {
    const result = await db.query('SELECT status, COUNT(*)::int AS count FROM subscriptions GROUP BY status ORDER BY status');
    if (!result.rows.length) return 'none';
    return result.rows.map(row => `${row.status}:${row.count}`).join(', ');
  } catch (_) {
    return 'unknown';
  }
}

async function getLastCronSummary() {
  try {
    const result = await db.query(
      'SELECT job_name, status, affected_rows, finished_at, error_message FROM cron_runs ORDER BY id DESC LIMIT 3'
    );
    if (!result.rows.length) return 'none';
    return result.rows
      .map(row => {
        const suffix = row.status === 'error' && row.error_message ? ` (${truncate(row.error_message, 80)})` : '';
        return `${row.job_name}:${row.status || 'running'}:${row.affected_rows ?? 0}${suffix}`;
      })
      .join('\n');
  } catch (_) {
    return 'unknown';
  }
}

async function getStatusText() {
  let dbStatus = 'ok';
  try {
    await db.query('SELECT 1 AS ok');
  } catch (error) {
    dbStatus = 'error: ' + truncate(error.message, 120);
  }

  const memory = process.memoryUsage();
  const users = await optionalCount("SELECT COUNT(*) FROM users WHERE role != 'admin'");
  const pendingPayments = await optionalCount("SELECT COUNT(*) FROM payments WHERE status='pending'");
  const waitingFeedback = await optionalCount("SELECT COUNT(*) FROM feedback_messages WHERE status IN ('new','waiting_admin')");
  const subscriptions = await getSubscriptionSummary();
  const cron = await getLastCronSummary();
  const load = os.loadavg().map(value => value.toFixed(2)).join(' ');

  return [
    '<b>SmartPlate status</b>',
    `time: ${new Date().toISOString()}`,
    `api: online`,
    `db: ${escapeHtml(dbStatus)}`,
    `uptime: ${formatDuration(process.uptime())}`,
    `rss: ${Math.round(memory.rss / 1024 / 1024)} MB`,
    `system: ${escapeHtml(os.hostname())}, load ${load}`,
    `users: ${users ?? 'unknown'}`,
    `subscriptions: ${escapeHtml(subscriptions)}`,
    `pending payments: ${pendingPayments ?? 'unknown'}`,
    `waiting feedback: ${waitingFeedback ?? 'unknown'}`,
    `cron:\n${escapeHtml(cron)}`
  ].join('\n');
}

async function getHealthText() {
  try {
    await db.query('SELECT 1 AS ok');
    return '<b>SmartPlate health</b>\napi: online\ndb: ok';
  } catch (error) {
    return `<b>SmartPlate health</b>\napi: online\ndb: error\n${escapeHtml(truncate(error.message, 500))}`;
  }
}

async function handleTelegramMessage(message, fastify) {
  const { chatId } = getConfig();
  const fromChatId = String(message.chat?.id || '');
  const text = String(message.text || '').trim();
  if (!text || fromChatId !== String(chatId)) return;

  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  try {
    if (command === '/start' || command === '/help') {
      await sendTelegramMessage([
        '<b>SmartPlate alerts bot</b>',
        '/status - full API/DB/status summary',
        '/health - short API + DB check',
        '/ping - bot response check',
        '/help - commands'
      ].join('\n'));
    } else if (command === '/ping') {
      await sendTelegramMessage(`<b>SmartPlate ping</b>\npong\n${new Date().toISOString()}`);
    } else if (command === '/health') {
      await sendTelegramMessage(await getHealthText());
    } else if (command === '/status') {
      await sendTelegramMessage(await getStatusText());
    } else if (command.startsWith('/')) {
      await sendTelegramMessage('Unknown command. Use /help.');
    }
  } catch (error) {
    fastify.log.error(error, 'Telegram command failed');
    await sendTelegramAlert(`Telegram command failed: ${error.message}`, {
      key: 'telegram-command-failed',
      fastify
    });
  }
}

async function pollOnce(fastify) {
  const { chatId } = getConfig();
  if (!chatId) return;
  const data = await telegramRequest('getUpdates', {
    offset: updateOffset || undefined,
    timeout: POLL_TIMEOUT_SECONDS,
    allowed_updates: ['message']
  }, (POLL_TIMEOUT_SECONDS + 5) * 1000);

  for (const update of data.result || []) {
    updateOffset = Math.max(updateOffset, update.update_id + 1);
    if (update.message) await handleTelegramMessage(update.message, fastify);
  }
}

function schedulePoll(fastify) {
  if (stopped) return;
  pollTimer = setTimeout(() => runPollLoop(fastify), POLL_INTERVAL_MS);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();
}

async function runPollLoop(fastify) {
  if (polling || stopped) return;
  polling = true;
  try {
    await pollOnce(fastify);
  } catch (error) {
    fastify.log.error(error, 'Telegram polling failed');
  } finally {
    polling = false;
    schedulePoll(fastify);
  }
}

function startTelegramBot(fastify) {
  const { enabled, pollEnabled } = getConfig();
  if (!enabled) {
    fastify.log.info('Telegram alerts disabled: TG_BOT_TOKEN or TG_CHAT_ID is missing');
    return false;
  }
  fastify.log.info('Telegram alerts enabled');
  if (!pollEnabled) {
    fastify.log.info('Telegram bot polling disabled by TG_BOT_POLLING=false');
    return true;
  }
  stopped = false;
  schedulePoll(fastify);
  fastify.log.info('Telegram bot polling started');
  return true;
}

function stopTelegramBot() {
  stopped = true;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

module.exports = {
  escapeHtml,
  getHealthText,
  getStatusText,
  sendTelegramAlert,
  sendTelegramMessage,
  startTelegramBot,
  stopTelegramBot
};
