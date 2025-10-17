// scripts/db-schema-check-direct.js
// Connects using DIRECT_URL or DATABASE_URL and inspects schema via direct SQL (no Supabase REST)
const { Client } = require('pg');

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error('Set DIRECT_URL or DATABASE_URL in env before running this script');
  process.exit(2);
}

const expectedTables = [
  'projects',
  'scraper_templates',
  'scraping_jobs',
  'scraped_data',
  'user_profiles',
  'login_attempts',
  'api_keys'
];

async function run() {
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  client.on('error', (e) => {
    console.error('PG client error event:', e && e.message ? e.message : e);
  });

  try {
    await client.connect();
    console.log('Connected OK to direct DB. Gathering schema info...');

    // Get list of tables in public schema
    const tablesRes = await client.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' AND table_type=\'BASE TABLE\'');
    const presentTables = tablesRes.rows.map(r => r.table_name);

    const report = {
      timestamp: new Date().toISOString(),
      connection: 'direct',
      expectedTables,
      presentTables,
      missingTables: [],
      tableDetails: {}
    };

    for (const t of expectedTables) {
      if (!presentTables.includes(t)) {
        report.missingTables.push(t);
        report.tableDetails[t] = { exists: false };
        continue;
      }

      // Columns
      const colsRes = await client.query(
        'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1', [t]
      );
      const columns = colsRes.rows.map(r => ({ name: r.column_name, type: r.data_type }));

      // Row count (fast but may be slow on big tables; it's ok for verification)
      let count = null;
      try {
        const countRes = await client.query(`SELECT COUNT(*)::int as cnt FROM public."${t}"`);
        count = countRes.rows[0].cnt;
      } catch (err) {
        // ignore count errors (table may be large or deny permission); leave count as null
        count = null;
      }

      report.tableDetails[t] = { exists: true, columns, count };
    }

    // Also report any extra relevant tables (present but not expected)
    report.extraTables = presentTables.filter(t => !expectedTables.includes(t));

    // Print a human-friendly summary
    console.log('\n=== SCHEMA CHECK REPORT ===');
    console.log('Timestamp:', report.timestamp);
    console.log('\nExpected tables:', expectedTables.join(', '));
    console.log('Present tables:', presentTables.join(', '));
    if (report.missingTables.length) {
      console.log('\nMissing tables:', report.missingTables.join(', '));
    } else {
      console.log('\nAll expected tables present');
    }

    console.log('\nTable details:');
    for (const [tn, info] of Object.entries(report.tableDetails)) {
      if (!info.exists) {
        console.log(` - ${tn}: MISSING`);
        continue;
      }
      const colNames = info.columns.map(c => c.name).join(', ');
      console.log(` - ${tn}: columns(${info.columns.length}) [${colNames}]` + (info.count !== null ? `, rows=${info.count}` : ''));
    }

    if (report.extraTables.length) {
      console.log('\nExtra tables found (not in expected list):', report.extraTables.join(', '));
    }

    // Exit code 0 for success; non-zero if missing tables
    process.exit(report.missingTables.length ? 3 : 0);
  } catch (err) {
    console.error('Schema check failed:', err && err.message ? err.message : err);
    process.exit(2);
  } finally {
    try {
      await client.end();
    } catch (e) {
      // ignore client close errors
    }
  }
}

run();
