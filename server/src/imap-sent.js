const tls = require('tls');

const DEFAULT_PORT = 993;
const TIMEOUT_MS = Math.min(Math.max(Number(process.env.IMAP_TIMEOUT_MS) || 15000, 3000), 30000);

function envFor(sender, name) {
  return process.env['IMAP_' + sender.toUpperCase() + '_' + name] || '';
}

function configFor(sender) {
  const host = envFor(sender, 'HOST') || process.env.IMAP_HOST || '';
  const user = envFor(sender, 'USER');
  const pass = envFor(sender, 'PASS');
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(envFor(sender, 'PORT') || process.env.IMAP_PORT) || DEFAULT_PORT,
    user,
    pass,
    mailbox: envFor(sender, 'SENT_MAILBOX') || process.env.IMAP_SENT_MAILBOX || 'Sent'
  };
}

function quote(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function createSession(socket) {
  let buffer = '';
  let failed = null;
  const listeners = [];

  function flush() {
    while (listeners.length) {
      const listener = listeners[0];
      const match = listener.match(buffer);
      if (!match) break;
      listeners.shift();
      buffer = buffer.slice(match.end);
      listener.resolve(match.value);
    }
  }

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    flush();
  });
  socket.on('error', (err) => {
    failed = err;
    while (listeners.length) listeners.shift().reject(err);
  });
  socket.on('close', () => {
    if (!failed) {
      failed = new Error('IMAP-сервер закрыл соединение');
      while (listeners.length) listeners.shift().reject(failed);
    }
  });

  function waitFor(match) {
    if (failed) return Promise.reject(failed);
    return new Promise((resolve, reject) => {
      listeners.push({ match, resolve, reject });
      flush();
    });
  }

  function tagged(tag) {
    return waitFor((input) => {
      const re = new RegExp('(?:^|\\r?\\n)' + tag + ' (OK|NO|BAD)(?: ([^\\r\\n]*))?\\r?\\n', 'i');
      const found = re.exec(input);
      if (!found) return null;
      if (found[1].toUpperCase() !== 'OK') {
        return { end: found.index + found[0].length, value: Promise.reject(new Error('IMAP ' + tag + ': ' + (found[2] || found[1]))) };
      }
      return { end: found.index + found[0].length, value: true };
    }).then((value) => value);
  }

  return { waitFor, tagged };
}

function waitForConnection(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Превышено время подключения к IMAP')), TIMEOUT_MS);
    socket.once('secureConnect', () => { clearTimeout(timer); resolve(); });
    socket.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function appendSentCopy(sender, rawMessage) {
  const config = configFor(sender);
  if (!config) return { saved: false, reason: 'not_configured' };

  const socket = tls.connect({
    host: config.host,
    port: config.port,
    servername: config.host,
    rejectUnauthorized: process.env.IMAP_REJECT_UNAUTHORIZED !== 'false'
  });
  socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('Превышено время ожидания IMAP')));
  const session = createSession(socket);

  try {
    await waitForConnection(socket);
    await session.waitFor((input) => {
      const found = /(?:^|\r?\n)\* (?:OK|PREAUTH)[^\r\n]*\r?\n/i.exec(input);
      return found ? { end: found.index + found[0].length, value: true } : null;
    });

    socket.write('A001 LOGIN ' + quote(config.user) + ' ' + quote(config.pass) + '\r\n');
    await session.tagged('A001');

    const bytes = Buffer.isBuffer(rawMessage) ? rawMessage : Buffer.from(rawMessage, 'utf8');
    socket.write('A002 APPEND ' + quote(config.mailbox) + ' (\\Seen) {' + bytes.length + '}\r\n');
    await session.waitFor((input) => {
      const found = /(?:^|\r?\n)\+[^\r\n]*\r?\n/.exec(input);
      return found ? { end: found.index + found[0].length, value: true } : null;
    });
    socket.write(bytes);
    socket.write('\r\n');
    await session.tagged('A002');

    socket.write('A003 LOGOUT\r\n');
    await session.tagged('A003');
    return { saved: true };
  } finally {
    socket.end();
    socket.destroy();
  }
}

module.exports = { appendSentCopy, configFor };
