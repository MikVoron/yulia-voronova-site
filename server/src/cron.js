const db = require('./db');
const { sendTrialExpired, sendSubscriptionExpired, sendSubscriptionExpiryReminder } = require('./email');
const { sendTelegramAlert } = require('./telegram');
const { flushMetrikaGoals } = require('./metrika-conversions');

async function expireTrials(fastify) {
  const jobId = (await db.query("INSERT INTO cron_runs (job_name) VALUES ('expire_trials') RETURNING id")).rows[0].id;
  try {
    // сначала найдём email-ы тех, у кого истёк триал
    const expiring = await db.query(
      "SELECT u.email FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status='trial' AND s.trial_ends_at < now()"
    );
    const result = await db.query(
      "UPDATE subscriptions SET status='expired', updated_at=now() WHERE status='trial' AND trial_ends_at < now()"
    );
    // отправим email каждому
    for (const row of expiring.rows) {
      sendTrialExpired(row.email).catch(e => fastify.log.error(e, 'Trial expired email error: ' + row.email));
    }
    await db.query("UPDATE cron_runs SET finished_at=now(), affected_rows=$2, status='success' WHERE id=$1", [jobId, result.rowCount]);
    return result.rowCount;
  } catch (e) {
    await db.query("UPDATE cron_runs SET finished_at=now(), status='error', error_message=$2 WHERE id=$1", [jobId, e.message]);
    throw e;
  }
}

async function expireSubscriptions(fastify) {
  const jobId = (await db.query("INSERT INTO cron_runs (job_name) VALUES ('expire_subscriptions') RETURNING id")).rows[0].id;
  try {
    // найдём email-ы тех, у кого истекла подписка
    const expiring = await db.query(
      "SELECT u.email FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status='active' AND s.active_until < now()"
    );
    const result = await db.query(
      "UPDATE subscriptions SET status='expired', updated_at=now() WHERE status='active' AND active_until < now()"
    );
    for (const row of expiring.rows) {
      sendSubscriptionExpired(row.email).catch(e => fastify.log.error(e, 'Sub expired email error: ' + row.email));
    }
    await db.query("UPDATE cron_runs SET finished_at=now(), affected_rows=$2, status='success' WHERE id=$1", [jobId, result.rowCount]);
    return result.rowCount;
  } catch (e) {
    await db.query("UPDATE cron_runs SET finished_at=now(), status='error', error_message=$2 WHERE id=$1", [jobId, e.message]);
    throw e;
  }
}

async function sendSubscriptionExpiryReminders(fastify) {
  const jobId = (await db.query("INSERT INTO cron_runs (job_name) VALUES ('subscription_expiry_reminders') RETURNING id")).rows[0].id;
  try {
    // One atomic update reserves each reminder before SMTP is called, so hourly
    // cron runs and concurrent processes cannot send the same reminder twice.
    const due = await db.query(`
      WITH due AS (
        SELECT s.user_id
          FROM subscriptions s
         WHERE s.status='active'
           AND s.active_until > now()
           AND s.active_until <= now() + interval '3 days'
           AND s.expiry_reminder_sent_at IS NULL
         FOR UPDATE SKIP LOCKED
      ), marked AS (
        UPDATE subscriptions s
           SET expiry_reminder_sent_at=now(), updated_at=now()
          FROM due
         WHERE s.user_id=due.user_id
         RETURNING s.user_id, s.active_until
      )
      SELECT u.email, marked.active_until
        FROM marked
        JOIN users u ON u.id=marked.user_id
    `);
    await Promise.all(due.rows.map(row =>
      sendSubscriptionExpiryReminder(row.email, row.active_until)
        .catch(e => fastify.log.error(e, 'Subscription expiry reminder email error: ' + row.email))
    ));
    await db.query("UPDATE cron_runs SET finished_at=now(), affected_rows=$2, status='success' WHERE id=$1", [jobId, due.rowCount]);
    return due.rowCount;
  } catch (e) {
    await db.query("UPDATE cron_runs SET finished_at=now(), status='error', error_message=$2 WHERE id=$1", [jobId, e.message]);
    throw e;
  }
}

async function cleanExpiredCodes() {
  const jobId = (await db.query("INSERT INTO cron_runs (job_name) VALUES ('clean_codes') RETURNING id")).rows[0].id;
  try {
    const result = await db.query("DELETE FROM login_codes WHERE expires_at < now() - interval '1 hour'");
    await db.query("UPDATE cron_runs SET finished_at=now(), affected_rows=$2, status='success' WHERE id=$1", [jobId, result.rowCount]);
    return result.rowCount;
  } catch (e) {
    await db.query("UPDATE cron_runs SET finished_at=now(), status='error', error_message=$2 WHERE id=$1", [jobId, e.message]);
    throw e;
  }
}

async function cleanExpiredRefreshSessions() {
  const jobId = (await db.query("INSERT INTO cron_runs (job_name) VALUES ('clean_refresh_sessions') RETURNING id")).rows[0].id;
  try {
    const result = await db.query('DELETE FROM refresh_sessions WHERE expires_at <= now()');
    await db.query("UPDATE cron_runs SET finished_at=now(), affected_rows=$2, status='success' WHERE id=$1", [jobId, result.rowCount]);
    return result.rowCount;
  } catch (e) {
    await db.query("UPDATE cron_runs SET finished_at=now(), status='error', error_message=$2 WHERE id=$1", [jobId, e.message]);
    throw e;
  }
}

let _running = false;

async function runCronJobs(fastify) {
  if (_running) return;
  _running = true;
  try {
    const t = await expireTrials(fastify);
    const m = await sendSubscriptionExpiryReminders(fastify);
    const s = await expireSubscriptions(fastify);
    const c = await cleanExpiredCodes();
    const r = await cleanExpiredRefreshSessions();
    const metrika = await flushMetrikaGoals(fastify);
    if (t || m || s || c || r || metrika.sent || metrika.failed) {
      fastify.log.info({ expiredTrials: t, subscriptionReminders: m, expiredSubs: s, cleanedCodes: c, cleanedRefreshSessions: r, metrikaGoals: metrika }, 'cron completed');
    }
  } catch (e) {
    fastify.log.error(e, 'cron error');
    sendTelegramAlert(`cron error\n${e.stack || e.message}`, {
      key: 'cron-error',
      title: 'SmartPlate cron error',
      fastify
    });
  } finally {
    _running = false;
  }
}

function startCron(fastify) {
  // Запуск сразу при старте сервера
  runCronJobs(fastify);
  // Затем каждый час с защитой от параллельного выполнения
  setInterval(() => runCronJobs(fastify), 60 * 60 * 1000);
  fastify.log.info('Cron started (every 1h, with overlap guard)');
}

module.exports = { startCron, runCronJobs, cleanExpiredRefreshSessions, sendSubscriptionExpiryReminders };
