const db = require('./db');

/**
 * Записывает событие в аудит-лог.
 * @param {string} event — тип события (login, register, trial_granted, trial_denied, payment_confirm и т.д.)
 * @param {object} opts — audit context; request/session/entity fields are optional.
 */
async function insert(queryable, event, opts) {
  const {
    userId, email, detail, ip, ua, requestId, sessionId,
    entityType, entityId, changedFields
  } = opts || {};
  const result = await queryable.query(
    `INSERT INTO audit_log
       (user_id, email, event, detail, ip, ua, request_id, session_id,
        entity_type, entity_id, changed_fields)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      userId || null, email || null, event, detail || null, ip || null, ua || null,
      requestId || null, sessionId || null, entityType || null, entityId || null,
      changedFields || null
    ]
  );
  return result.rows[0];
}

async function log(event, opts) {
  try {
    await insert(db, event, opts);
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

module.exports = { log, insert };
