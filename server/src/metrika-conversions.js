const db = require('./db');

const COUNTER_ID = '111434385';
const PLATFORM_URL = 'https://plate.voronova.online/login.html';
const GOALS = new Set(['registration_started', 'verification_code_sent', 'registration_completed']);

function normalizeClientId(value) {
  if (typeof value !== 'string') return null;
  const clientId = value.trim();
  return /^\d{8,32}$/.test(clientId) ? clientId : null;
}

function measurementToken() {
  return (process.env.METRIKA_MEASUREMENT_PROTOCOL_TOKEN || '').trim();
}

async function queueMetrikaGoal({ goalId, userId = null, clientId, occurredAt = new Date() }) {
  const normalizedClientId = normalizeClientId(clientId);
  if (!GOALS.has(goalId) || !normalizedClientId) return false;

  await db.query(
    `INSERT INTO metrika_goal_outbox (goal_id, user_id, metrika_client_id, occurred_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, goal_id)
       WHERE user_id IS NOT NULL AND goal_id = 'registration_completed'
     DO NOTHING`,
    [goalId, userId, normalizedClientId, occurredAt]
  );
  return true;
}

async function sendGoal(row) {
  const token = measurementToken();
  if (!token) throw new Error('METRIKA_MEASUREMENT_PROTOCOL_TOKEN is not configured');

  const url = new URL('https://mc.yandex.ru/collect');
  url.search = new URLSearchParams({
    tid: COUNTER_ID,
    cid: row.metrika_client_id,
    t: 'event',
    ea: row.goal_id,
    et: String(Math.floor(new Date(row.occurred_at).getTime() / 1000)),
    dl: PLATFORM_URL,
    ms: token
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { method: 'POST', signal: controller.signal });
    if (!response.ok) throw new Error('Metrika Measurement Protocol returned HTTP ' + response.status);
  } finally {
    clearTimeout(timeout);
  }
}

async function claimPendingGoals(limit) {
  const result = await db.query(
    `WITH picked AS (
       SELECT id
         FROM metrika_goal_outbox
        WHERE (status IN ('pending', 'retry') AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
           OR (status = 'sending' AND last_attempt_at < now() - interval '15 minutes')
        ORDER BY occurred_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE metrika_goal_outbox outbox
        SET status='sending', attempts=outbox.attempts + 1, last_attempt_at=now(), last_error=NULL
       FROM picked
      WHERE outbox.id=picked.id
     RETURNING outbox.id, outbox.goal_id, outbox.metrika_client_id, outbox.occurred_at, outbox.attempts`,
    [limit]
  );
  return result.rows;
}

async function flushMetrikaGoals(fastify, limit = 25) {
  if (!measurementToken()) return { sent: 0, failed: 0, skipped: true };

  const rows = await claimPendingGoals(limit);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await sendGoal(row);
      // The client identifier is needed only until the event is acknowledged.
      await db.query(
        `UPDATE metrika_goal_outbox
            SET status='delivered', delivered_at=now(), metrika_client_id=NULL
          WHERE id=$1`,
        [row.id]
      );
      sent += 1;
    } catch (error) {
      const retryAfterSeconds = Math.min(3600, 30 * Math.pow(2, Math.min(row.attempts - 1, 7)));
      await db.query(
        `UPDATE metrika_goal_outbox
            SET status='retry', next_attempt_at=now() + ($2 * interval '1 second'),
                last_error=$3
          WHERE id=$1`,
        [row.id, retryAfterSeconds, String(error.message || error).slice(0, 500)]
      );
      failed += 1;
      fastify.log.warn({ err: error, metrikaGoalId: row.id, goalId: row.goal_id }, 'Metrika goal delivery failed; queued for retry');
    }
  }
  return { sent, failed, skipped: false };
}

function dispatchMetrikaGoals(fastify) {
  setImmediate(() => {
    flushMetrikaGoals(fastify, 10).catch(error => {
      fastify.log.error(error, 'Metrika goal dispatch failed');
    });
  });
}

module.exports = { normalizeClientId, queueMetrikaGoal, flushMetrikaGoals, dispatchMetrikaGoals };
