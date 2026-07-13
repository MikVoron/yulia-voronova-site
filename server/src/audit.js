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
    // Основной flow не ломаем, но потерю аудита больше не скрываем: дежурный
    // получает отдельный сигнал, не содержащий пользовательских секретов.
    console.error('audit.log error:', e.message);
    try {
      const { sendTelegramAlert } = require('./telegram');
      await sendTelegramAlert(`audit_log недоступен\nevent: ${String(event).slice(0, 80)}\n${String(e.message).slice(0, 300)}`, {
        key: 'audit-log-write-failed',
        title: 'SmartPlate audit failure'
      });
    } catch (alertError) {
      console.error('audit alert error:', alertError.message);
    }
    return false;
  }
  return true;
}

module.exports = { log };
