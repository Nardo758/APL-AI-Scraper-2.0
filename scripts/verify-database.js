const { createClient } = require('@supabase/supabase-js');
const path = require('path');

class DatabaseVerifier {
  constructor() {
    if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      console.log('❌ Supabase environment variables not set');
      console.log('   Set SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }

    const keyToUse = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      keyToUse
    );
  }

  async testConnection() {
    try {
      console.log('Testing Supabase connection...');

      const { data, error } = await this.supabase
        .from('projects')
        .select('id')
        .limit(1);

      if (error) {
        throw new Error(`Connection failed: ${error.message}`);
      }

      console.log('✅ Supabase connection successful');
      return true;
    } catch (error) {
      console.log(`❌ Supabase connection failed: ${error.message}`);
      return false;
    }
  }

  async verifySchema() {
    const expectedTables = [
      'projects',
      'scraper_templates',
      'scraping_jobs',
      'scraped_data',
      'user_profiles',
      'login_attempts',
      'api_keys'
    ];

    console.log('Verifying database schema...');

    const results = {
      connected: false,
      tables: {},
      missingTables: [],
      schemaMatches: false
    };

    results.connected = await this.testConnection();
    if (!results.connected) return results;

    for (const tableName of expectedTables) {
      try {
        const { data, error } = await this.supabase
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          // Supabase exposes Postgres errors differently; check message
          const msg = error.message || '';
          if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01')) {
            results.tables[tableName] = { exists: false };
            results.missingTables.push(tableName);
          } else {
            results.tables[tableName] = { exists: true, error: msg };
          }
        } else {
          results.tables[tableName] = { exists: true, sampleCount: (data && data.length) || 0 };
        }
      } catch (err) {
        results.tables[tableName] = { exists: false, error: err.message };
        results.missingTables.push(tableName);
      }
    }

    results.schemaMatches = results.missingTables.length === 0;
    return results;
  }

  async checkTableStructure() {
    const tableDefinitions = {
      projects: ['id', 'name', 'user_id', 'created_at'],
      scraper_templates: ['id', 'project_id', 'name', 'code', 'config', 'status'],
      scraping_jobs: ['id', 'project_id', 'template_id', 'status', 'url', 'config'],
      scraped_data: ['id', 'job_id', 'data', 'url', 'created_at']
    };

    const structureResults = {};

    for (const [tableName, expectedColumns] of Object.entries(tableDefinitions)) {
      try {
        const { data, error } = await this.supabase
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          structureResults[tableName] = { error: error.message };
          continue;
        }

        if (data && data.length > 0) {
          const actualColumns = Object.keys(data[0]);
          const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
          const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));

          structureResults[tableName] = {
            exists: true,
            columns: actualColumns,
            missingColumns,
            extraColumns,
            matches: missingColumns.length === 0
          };
        } else {
          structureResults[tableName] = {
            exists: true,
            empty: true,
            matches: true // Can't verify columns on empty table
          };
        }
      } catch (error) {
        structureResults[tableName] = { error: error.message };
      }
    }

    return structureResults;
  }

  async generateSchemaReport() {
    console.log('Generating database schema report...');

    const connectionTest = await this.testConnection();
    if (!connectionTest) {
      return { success: false, error: 'Database connection failed' };
    }

    const schemaVerification = await this.verifySchema();
    const tableStructure = await this.checkTableStructure();

    const recordCounts = {};
    const mainTables = ['projects', 'scraper_templates', 'scraping_jobs', 'scraped_data'];

    for (const table of mainTables) {
      if (schemaVerification.tables[table] && schemaVerification.tables[table].exists) {
        try {
          const { count, error } = await this.supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

          if (!error) recordCounts[table] = count;
        } catch (e) {
          // ignore
        }
      }
    }

    const report = {
      timestamp: new Date().toISOString(),
      connection: {
        url: process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing',
        key: process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing',
        connected: connectionTest
      },
      schema: schemaVerification,
      tableStructure,
      recordCounts,
      recommendations: []
    };

    if (schemaVerification.missingTables.length > 0) {
      report.recommendations.push({
        type: 'missing_tables',
        severity: 'high',
        message: `Create missing tables: ${schemaVerification.missingTables.join(', ')}`,
        action: 'Run schema setup scripts'
      });
    }

    // Check for RLS policies by attempting a select; if no error, RLS may not be active
    const { error: rlsError } = await this.supabase
      .from('projects')
      .select('*')
      .limit(1);

    if (!rlsError) {
      report.recommendations.push({
        type: 'rls_missing',
        severity: 'high',
        message: 'Row Level Security may not be enabled',
        action: 'Enable RLS and create policies'
      });
    }

    return report;
  }
}

module.exports = DatabaseVerifier;

// If the script is run directly, execute a verification and print a report
if (require.main === module) {
  (async () => {
    try {
      const verifier = new DatabaseVerifier();
      const report = await verifier.generateSchemaReport();

      console.log('\n📊 DATABASE SCHEMA REPORT');
      console.log('========================\n');

      console.log('🔌 Connection:');
      console.log('   URL:', report.connection.url);
      console.log('   Key:', report.connection.key);
      console.log('   Connected:', report.connection.connected ? 'Yes' : 'No');
      console.log('');

      console.log('🏗  Schema:');
      console.log('   Matches expected:', report.schema.schemaMatches ? 'Yes' : 'No');
      if (report.schema.missingTables && report.schema.missingTables.length > 0) {
        console.log('   Missing tables:', report.schema.missingTables.join(', '));
      }
      console.log('');

      console.log('📈 Record Counts:');
      Object.entries(report.recordCounts || {}).forEach(([table, count]) => {
        console.log('   ' + table + ': ' + count);
      });
      console.log('');

      if (report.recommendations && report.recommendations.length > 0) {
        console.log('💡 Recommendations:');
        report.recommendations.forEach(rec => {
          console.log('   -', rec.message, '->', rec.action);
        });
      } else {
        console.log('✅ No immediate recommendations');
      }

      process.exit(0);
    } catch (err) {
      console.error('Verification failed:', err && err.message ? err.message : err);
      process.exit(2);
    }
  })();
}
