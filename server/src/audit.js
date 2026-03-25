const db = require('./db');

/**
 * Записывает событие в аудит-лог.
 * @param {string} event — тип события (login, register, trial_granted, trial_denied, payment_confirm и т.д.)
 * @param {object} opts — { userId, email, detail, ip, ua }
 */
async function log(event, opts) {
  const { userId, email, detail, ip, ua } = opts || {};
  try {
    await db.query(
      'INSERT INTO audit_log (user_id, email, event, detail, ip, ua) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId || null, email || null, event, detail || null, ip || null, ua || null]
    );
  } catch (e) {
    // Не ломаем основной flow если лог не записался
    console.error('audit.log error:', e.message);
  }
}

module.exports = { log };
