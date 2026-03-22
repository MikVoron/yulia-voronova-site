require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const authRoutes = require('./src/routes/auth');
const subscriptionRoutes = require('./src/routes/subscriptions');
const adminRoutes = require('./src/routes/admin');
const { startCron } = require('./src/cron');

fastify.register(cors, {
  origin: ['https://voronova.online', 'https://www.voronova.online'],
  credentials: true
});
fastify.register(cookie);
fastify.register(authRoutes);
fastify.register(subscriptionRoutes);
fastify.register(adminRoutes);

fastify.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  startCron(fastify);
});
