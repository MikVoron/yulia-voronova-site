const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const JWT_SECRET_MIN_BYTES = 32;
const JWT_SECRET_MIN_DISTINCT_BYTES = 8;
const KNOWN_WEAK_JWT_SECRETS = new Set([
  'your-secret-key-here',
  'change-me',
  'changeme',
  'secret',
  'test-secret-key-for-vitest'
]);

function validateJwtSecret(value = process.env.JWT_SECRET) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < JWT_SECRET_MIN_BYTES) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }
  const normalized = value.trim().toLowerCase();
  const distinctBytes = new Set(Buffer.from(value, 'utf8')).size;
  if (KNOWN_WEAK_JWT_SECRETS.has(normalized) || distinctBytes < JWT_SECRET_MIN_DISTINCT_BYTES) {
    throw new Error('JWT_SECRET must not be a placeholder or repeated pattern');
  }
  return value;
}

function generateAccessToken(user, sessionId) {
  const payload = { sub: user.id, email: user.email, role: user.role };
  if (sessionId) payload.sid = sessionId;
  return jwt.sign(payload, validateJwtSecret(), { expiresIn: '15m' });
}
function generateRefreshToken() { return crypto.randomBytes(32).toString('hex'); }
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function verifyAccessToken(token) { return jwt.verify(token, validateJwtSecret()); }
function generateLoginCode() { return crypto.randomInt(100000, 1000000).toString(); }
module.exports = { generateAccessToken, generateRefreshToken, hashToken, verifyAccessToken, generateLoginCode, validateJwtSecret };
