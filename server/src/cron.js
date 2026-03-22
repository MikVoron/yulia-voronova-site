const db = require('./db');

async function expireTrials() {
  const jobId = (await db.query("INSERT INTO cron_runs (job_name) VALUES ('expire_trials') RETURNING id")).rows[0].id;
  try {
    const result = await db.query(
      "UPDATE subscriptions SET status='expired', updated_at=now() WHERE status='trial' AND trial_ends_at < now()"
    );
    await db.query("UPDATE cron_runs SET finished_at=now(), affected_rows=$2, status='success' WHERE id=$1", [jobId, result.rowCount]);
    return result.rowCount;
  } catch (e) {
    await db.query("UPDATE cron_runs SET finished_at=now(), status='error', error_message=$2 WHERE id=$1", [jobId, e.message]);
    throw e;
  }
}

async function expireSubscriptions() {
  const jobId = (await db.query("INSERT INTO cron_runs (job_name) VALUES ('expire_subscriptions') RETURNING id")).rows[0].id;
  try {
    const result = await db.query(
      "UPDATE subscriptions SET status='expired', updated_at=now() WHERE status='active' AND active_until < now()"
    );
    await db.query("UPDATE cron_runs SET finished_at=now(), affected_rows=$2, status='success' WHERE id=$1", [jobId, result.rowCount]);
    return result.rowCount;
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

function startCron(fastify) {
  // каждый час
  setInterval(async () => {
    try {
      const t = await expireTrials();
      const s = await expireSubscriptions();
      const c = await cleanExpiredCodes();
      if (t || s || c) fastify.log.info({ expiredTrials: t, expiredSubs: s, cleanedCodes: c }, 'cron completed');
    } catch (e) {
      fastify.log.error(e, 'cron error');
    }
  }, 60 * 60 * 1000);
  fastify.log.info('Cron started (every 1h)');
}

module.exports = { startCron };
