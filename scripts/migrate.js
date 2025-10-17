// APL AI Scraper 2.0 - Database Migration Script
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

require('dotenv').config();

class MigrationRunner {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }

  async runMigrations() {
    try {
      console.log('ðŸš€ Starting database migrations...');

      const migrationsDir = path.join(__dirname, '..', 'migrations');
      const migrationFiles = await fs.readdir(migrationsDir);

      // Sort migration files by name (assuming naming convention: 001_name.sql)
      const sortedMigrations = migrationFiles
        .filter(file => file.endsWith('.sql'))
        .sort();

      for (const migrationFile of sortedMigrations) {
        console.log(`ðŸ“„ Running migration: ${migrationFile}`);
        
        const migrationPath = path.join(migrationsDir, migrationFile);
        const migrationSql = await fs.readFile(migrationPath, 'utf8');

        // Execute migration
        const { error } = await this.supabase.rpc('exec_sql', {
          sql_query: migrationSql
        });

        if (error) {
          console.error(`âŒ Migration ${migrationFile} failed:`, error);
          throw error;
        }

        console.log(`âœ… Migration ${migrationFile} completed`);
      }

      console.log('ðŸŽ‰ All migrations completed successfully!');
    } catch (error) {
      console.error('ðŸ’¥ Migration failed:', error);
      process.exit(1);
    }
  }

  async checkConnection() {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('count(*)')
        .limit(1);

      if (error) {
        console.error('âŒ Database connection failed:', error.message);
        return false;
      }

      console.log('âœ… Database connection successful');
      return true;
    } catch (error) {
      console.error('âŒ Database connection error:', error.message);
      return false;
    }
  }
}

// Run migrations if called directly
if (require.main === module) {
  const runner = new MigrationRunner();
  
  runner.checkConnection().then(connected => {
    if (connected) {
      runner.runMigrations();
    } else {
      console.error('ðŸ’¥ Cannot run migrations without database connection');
      process.exit(1);
    }
  });
}

module.exports = { MigrationRunner };