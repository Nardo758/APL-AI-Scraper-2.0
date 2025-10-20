// scripts/simple-db-verify.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

(async function main(){
  console.log('🔍 Simple Database Verification');
  console.log('==============================');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log('❌ Missing environment variables');
    console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set');
    console.log('   SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Set' : 'Not set');
    process.exit(1);
  }

  console.log('✅ Environment variables found');

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    console.log('Testing connection...');

    // Try to read from a lightweight metadata table 'projects' if available
    const res = await supabase
      .from('projects')
      .select('*')
      .limit(1);

    const error = res && res.error ? res.error : null;

    if (error) {
      console.log('❌ Connection failed:', error.message || error);
      console.log('   Error code:', error && error.code ? error.code : 'none');

      if (error && error.code === 'PGRST301') {
        console.log('   This usually means: Invalid API key or project URL');
      } else if (error && error.code === '42P01') {
        console.log('   This usually means: Table doesn\'t exist');
      }

      process.exit(1);
    }

    console.log('✅ Connection successful (projects table accessible or call returned without error)');

    const tables = ['scraper_templates', 'scraping_jobs', 'scraped_data'];

    for (const table of tables) {
      const tblRes = await supabase
        .from(table)
        .select('*')
        .limit(1);

      const tableError = tblRes && tblRes.error ? tblRes.error : null;

      if (tableError) {
        if (tableError.code === '42P01') {
          console.log(`❌ Table ${table}: MISSING`);
        } else {
          console.log(`⚠️  Table ${table}: ERROR - ${tableError.message || tableError}`);
        }
      } else {
        console.log(`✅ Table ${table}: EXISTS`);
      }
    }

    console.log('');
    console.log('📊 Verification complete!');
  } catch (err) {
    console.log('❌ Unexpected error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
