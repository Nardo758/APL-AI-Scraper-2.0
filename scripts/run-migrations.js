#!/usr/bin/env node
/**
 * Safe migration runner (conservative):
 * - list: prints migration files
 * - dry-run: prints migration contents + checksum
 * - apply: applies migrations in order when DATABASE_URL is set and --yes provided
 * 
 * This runner uses `pg` when executing SQL. In CI/dev without DATABASE_URL it will not attempt to run SQL.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const migrationsDir = path.join(__dirname, '..', 'migrations');
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

function checksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

const cmd = process.argv[2] || 'list';
const doApply = cmd === 'apply';
const dryRun = cmd === 'dry-run' || cmd === 'dr';

console.log('Migration runner mode:', cmd);

if (files.length === 0) {
  console.log('No migrations found in', migrationsDir);
  process.exit(0);
}

if (cmd === 'list') {
  console.log('Migrations found:');
  for (const f of files) console.log('-', f);
  process.exit(0);
}

// show dry-run details
if (dryRun) {
  console.log('Dry-run: showing migration contents and checksums');
  for (const f of files) {
    const p = path.join(migrationsDir, f);
    const content = fs.readFileSync(p, 'utf8');
    console.log('\n---', f, '---');
    console.log(content.substring(0, 1000));
    console.log('--- checksum:', checksum(content));
  }
  process.exit(0);
}

// For apply mode require DATABASE_URL and confirmation
if (doApply) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Refusing to apply migrations.');
    process.exit(2);
  }

  const yes = process.argv.includes('--yes');
  if (!yes) {
    console.log('To actually apply migrations pass --yes. Example: run-migrations.js apply --yes');
    process.exit(0);
  }

  // run migrations using pg
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  (async () => {
    await client.connect();
    try {
      // ensure migration history table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS migration_history (
          id SERIAL PRIMARY KEY,
          filename TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
      `);

      // load applied migrations
      const res = await client.query('SELECT filename, checksum FROM migration_history ORDER BY id');
      const applied = new Map(res.rows.map((r) => [r.filename, r.checksum]));

      for (const f of files) {
        const p = path.join(migrationsDir, f);
        const content = fs.readFileSync(p, 'utf8');
        const ch = checksum(content);
        if (applied.has(f) && applied.get(f) === ch) {
          console.log('Skipping already applied migration:', f);
          continue;
        }

        console.log('Applying migration:', f);
        try {
          await client.query('BEGIN');
          await client.query(content);
          await client.query('INSERT INTO migration_history (filename, checksum) VALUES ($1, $2)', [f, ch]);
          await client.query('COMMIT');
          console.log('Applied', f);
        } catch (applyErr) {
          await client.query('ROLLBACK');
          console.error('Failed to apply migration', f, applyErr.message);
          throw applyErr;
        }
      }

      console.log('Migrations complete');
    } catch (err) {
      console.error('Migration runner error:', err.message || err);
      process.exit(2);
    } finally {
      await client.end();
    }
  })();
}

console.error('Unknown command:', cmd);
process.exit(2);
