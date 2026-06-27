const audit = require('./audit');
const { sendTelegramAlert } = require('./telegram');

const FINGERPRINT_RE = /^[a-f0-9]{64}$/i;

function inspectFingerprint(value) {
  if (value == null || value === '') return { status: 'missing', value: null };
  if (typeof value !== 'string' || !FINGERPRINT_RE.test(value)) {
    return { status: 'invalid', value: null };
  }
  return { status: 'valid', value: value.toLowerCase() };
}

function reportTrialSignals(options) {
  const {
    trial, userId, email, method, ip, ua, fastify,
    fingerprintStatus = 'not_collected'
  } = options || {};

  if (method === 'email' && fingerprintStatus === 'missing') {
    audit.log('trial_fingerprint_missing', {
      userId, email, detail: 'email registration without browser fingerprint', ip, ua
    });
  }

  const observation = trial && trial.observation;
  if (!observation || observation.level === 'normal') return;

  const detail = JSON.stringify({
    method,
    count24h: observation.count24h,
    count7d: observation.count7d,
    count90d: observation.count90d
  });
  audit.log('trial_network_' + observation.level, { userId, email, detail, ip, ua });

  if (observation.level === 'alert') {
    sendTelegramAlert(
      `Подозрительная серия регистраций\nIP: ${ip}\n24ч: ${observation.count24h}\n7д: ${observation.count7d}\n90д: ${observation.count90d}\nСпособ: ${method}`,
      {
        key: `trial-network-${ip}`,
        title: 'SmartPlate trial observation',
        minIntervalMs: 6 * 60 * 60 * 1000,
        fastify
      }
    ).catch(() => {});
  }
}

module.exports = { inspectFingerprint, reportTrialSignals, FINGERPRINT_RE };
