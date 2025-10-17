// scripts/test-pg-connection.js
const { Client } = require('pg');

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error('Set DIRECT_URL or DATABASE_URL in env');
  process.exit(2);
}

async function main(){
  // For quick testing allow self-signed certs; adjust in production
  const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

  // Attach error handler to avoid unhandled 'error' events from the pg client
  c.on('error', (e) => {
    // Log but don't throw — we manage lifecycle explicitly below
    console.error('PG client error event:', e && e.message ? e.message : e);
  });
  try {
    await c.connect();
    const res = await c.query('SELECT now() as now');
    console.log('Connected OK, server time:', res.rows[0].now);
    // success
    process.exitCode = 0;
  } catch (err) {
    console.error('Connection failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}
main();
