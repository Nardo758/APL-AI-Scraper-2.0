#!/usr/bin/env node
// scripts/apply-create-missing-tables.js
// Interactive runner to apply scripts/create-missing-tables.sql after explicit confirmation.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SQL_PATH = path.resolve(__dirname, 'create-missing-tables.sql');
if (!fs.existsSync(SQL_PATH)) {
  console.error('Migration SQL not found at', SQL_PATH);
  process.exit(2);
}

const sql = fs.readFileSync(SQL_PATH, 'utf8');

const args = process.argv.slice(2);
const autoYes = args.includes('--yes') || args.includes('-y');

console.log('=== APPLY MIGRATION: create-missing-tables.sql ===\n');
console.log('This script will execute the following SQL against the database pointed to by DIRECT_URL or DATABASE_URL:\n');
console.log('--- BEGIN SQL PREVIEW ---\n');
console.log(sql);
console.log('\n--- END SQL PREVIEW ---\n');

if (!autoYes) {
  console.log('To proceed, type YES (uppercase) and press Enter. Any other input will cancel.');
}

async function promptConfirm() {
  if (autoYes) return true;
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.on('data', (d) => {
      const val = (d || '').toString().trim();
      if (val === 'YES') resolve(true);
      else resolve(false);
      process.stdin.pause();
    });
  });
}

async function run() {
  const confirmed = await promptConfirm();
  if (!confirmed) {
    console.log('Cancelled by user. No changes were made.');
    process.exit(0);
  }

  const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!conn) {
    console.error('Set DIRECT_URL or DATABASE_URL in env before running this script');
    process.exit(2);
  }

  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  client.on('error', (e) => console.error('PG client error:', e && e.message ? e.message : e));

  try {
    await client.connect();
    console.log('Connected to DB. Beginning transaction to apply migration...');
    await client.query('BEGIN');

    // Run the SQL script
    await client.query(sql);

    await client.query('COMMIT');
    console.log('Migration applied successfully. COMMIT complete.');

    console.log('\nRollback instructions (if needed):');
    console.log(' - If you have backups/snapshots, restore from snapshot.');
    console.log(' - To drop just the created tables manually, run the following SQL (review before running):');
    console.log('\nDROP TABLE IF EXISTS public.api_keys CASCADE;');
    console.log('DROP TABLE IF EXISTS public.login_attempts CASCADE;');
    console.log('DROP TABLE IF EXISTS public.scraped_data CASCADE;');
    console.log('DROP TABLE IF EXISTS public.scraping_jobs CASCADE;');
    console.log('DROP TABLE IF EXISTS public.scraper_templates CASCADE;');
    console.log('DROP TABLE IF EXISTS public.projects CASCADE;\n');

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err && err.message ? err.message : err);
    try {
      await client.query('ROLLBACK');
      console.log('Rolled back transaction.');
    } catch (e) {
      // If rollback fails, log the error for investigation but continue to close the client
      console.error('Rollback failed:', e && e.message ? e.message : e);
    }
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch (e) {
      // ignore errors closing client
    }
  }
}

run();
