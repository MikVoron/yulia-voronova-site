const crypto = require('crypto');

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (!normalized) return null;
  let bits = '';
  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) return null;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function codeFor(secret, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(binary).padStart(6, '0');
}

function verifyTotp(code, base32Secret, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ''))) return false;
  const secret = decodeBase32(base32Secret);
  if (!secret || secret.length < 10) return false;
  const counter = Math.floor(now / 30000);
  const supplied = Buffer.from(String(code));
  for (let drift = -1; drift <= 1; drift += 1) {
    const expected = Buffer.from(codeFor(secret, counter + drift));
    if (expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

module.exports = { verifyTotp };
