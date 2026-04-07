require('dotenv').config();
const fastify = require('fastify')({ logger: true, bodyLimit: 8 * 1024 * 1024 });
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');
const authRoutes = require('./src/routes/auth');
const subscriptionRoutes = require('./src/routes/subscriptions');
const adminRoutes = require('./src/routes/admin');
const oauthRoutes = require('./src/routes/oauth');
const contentRoutes = require('./src/routes/content');
const favoritesRoutes = require('./src/routes/favorites');
const notesRoutes = require('./src/routes/notes');
const { startCron } = require('./src/cron');

const isProd = process.env.NODE_ENV === 'production';
const corsOrigins = ['https://voronova.online', 'https://www.voronova.online', 'https://app.voronova.online'];
if (!isProd) corsOrigins.push('http://127.0.0.1:5500', 'http://localhost:5500');

fastify.register(cors, {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
});
fastify.register(cookie);

// Security headers
fastify.register(helmet, {
  contentSecurityPolicy: false,   // CSP управляется на уровне HTML/nginx
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

// Global rate limit: 100 req/min per IP
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip
});
fastify.register(authRoutes);
fastify.register(subscriptionRoutes);
fastify.register(adminRoutes);
fastify.register(oauthRoutes);
fastify.register(contentRoutes);
fastify.register(favoritesRoutes);
fastify.register(notesRoutes);

const db = require('./src/db');

fastify.get('/health', async () => {
  const checks = { status: 'ok', time: new Date().toISOString() };
  try {
    const result = await db.query('SELECT 1 AS ok');
    checks.db = result.rows[0].ok === 1 ? 'ok' : 'error';
  } catch (e) {
    checks.db = 'error';
    checks.status = 'degraded';
    fastify.log.error(e, 'Health check: DB unreachable');
  }
  return checks;
});

// Unified error handler: consistent { error, statusCode } format + log 500s
fastify.setErrorHandler((err, req, reply) => {
  const status = err.statusCode || 500;
  if (status >= 500) {
    fastify.log.error(err, `Unhandled error on ${req.method} ${req.url}`);
  }
  reply.status(status).send({
    error: status >= 500 ? 'Внутренняя ошибка сервера' : (err.message || 'Ошибка'),
    statusCode: status
  });
});

fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  startCron(fastify);
});
