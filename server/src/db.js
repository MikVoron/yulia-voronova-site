const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 20),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 10000),
  query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 12000)
});
module.exports = { pool, query: (text, params) => pool.query(text, params) };
