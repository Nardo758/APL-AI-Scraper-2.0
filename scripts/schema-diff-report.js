// scripts/schema-diff-report.js
// Read-only schema diff report: compares expected schema to the live DB schema using DIRECT_URL/DATABASE_URL
const { Client } = require('pg');

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error('Set DIRECT_URL or DATABASE_URL in env before running this script');
  process.exit(2);
}

// Define expected schema (tables -> columns)
const expected = {
  projects: [
    'id', 'name', 'user_id', 'created_at'
  ],
  scraper_templates: [
    'id', 'project_id', 'name', 'code', 'config', 'status'
  ],
  scraping_jobs: [
    'id', 'project_id', 'template_id', 'status', 'url', 'config'
  ],
  scraped_data: [
    'id', 'job_id', 'data', 'url', 'created_at'
  ],
  user_profiles: [
    'user_id', 'email', 'location', 'created_at', 'updated_at'
  ],
  login_attempts: [
    'id', 'user_id', 'attempted_at', 'success'
  ],
  api_keys: [
    'id', 'user_id', 'key', 'created_at'
  ]
};

async function fetchLiveSchema(client) {
  const res = await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema=\'public\' AND table_type=\'BASE TABLE\'');
  const tables = res.rows.map(r => r.table_name);
  const schema = {};

  for (const t of tables) {
    const cols = await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1', [t]);
    schema[t] = cols.rows.map(r => r.column_name);
  }

  return schema;
}

function diff(expected, live) {
  const report = { tablesToCreate: {}, tablesToAlter: {}, tablesExtra: [] };

  // missing or differing tables
  for (const [t, cols] of Object.entries(expected)) {
    if (!live[t]) {
      report.tablesToCreate[t] = { missingColumns: cols };
      continue;
    }

    const liveCols = live[t] || [];
    const missingColumns = cols.filter(c => !liveCols.includes(c));
    const extraColumns = liveCols.filter(c => !cols.includes(c));
    if (missingColumns.length || extraColumns.length) {
      report.tablesToAlter[t] = { missingColumns, extraColumns };
    }
  }

  // extra tables
  for (const lt of Object.keys(live)) {
    if (!expected[lt]) report.tablesExtra.push(lt);
  }

  return report;
}

(async () => {
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  client.on('error', (e) => console.error('PG client error:', e && e.message ? e.message : e));

  try {
    await client.connect();
    const live = await fetchLiveSchema(client);
    const r = diff(expected, live);

    console.log('\n=== SCHEMA DIFF REPORT (READ-ONLY) ===\n');
    if (Object.keys(r.tablesToCreate).length === 0 && Object.keys(r.tablesToAlter).length === 0 && r.tablesExtra.length === 0) {
      console.log('No changes needed — live schema matches expected schema.');
    } else {
      if (Object.keys(r.tablesToCreate).length) {
        console.log('Tables that would be created:');
        for (const [t, info] of Object.entries(r.tablesToCreate)) {
          console.log(` - ${t}: columns(${info.missingColumns.length}) [${info.missingColumns.join(', ')}]`);
        }
      }

      if (Object.keys(r.tablesToAlter).length) {
        console.log('\nTables that would be altered:');
        for (const [t, info] of Object.entries(r.tablesToAlter)) {
          console.log(` - ${t}: missing columns(${info.missingColumns.join(', ') || 'none'}); extra columns(${info.extraColumns.join(', ') || 'none'})`);
        }
      }

      if (r.tablesExtra.length) {
        console.log('\nExtra tables present in live DB (not expected):', r.tablesExtra.join(', '));
      }

      console.log('\nNOTE: This is read-only. No SQL was executed.');
    }

    process.exit(Object.keys(r.tablesToCreate).length || Object.keys(r.tablesToAlter).length || r.tablesExtra.length ? 3 : 0);
  } catch (err) {
    console.error('Failed to produce diff report:', err && err.message ? err.message : err);
    process.exit(2);
  } finally {
    try {
      await client.end();
    } catch (e) {
      // ignore client close errors
    }
  }
})();
