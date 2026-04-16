const jwt = require('jsonwebtoken');
const crypto = require('crypto');
function generateAccessToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
}
function generateRefreshToken() { return crypto.randomBytes(32).toString('hex'); }
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function verifyAccessToken(token) { return jwt.verify(token, process.env.JWT_SECRET); }
function generateLoginCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }
module.exports = { generateAccessToken, generateRefreshToken, hashToken, verifyAccessToken, generateLoginCode };
