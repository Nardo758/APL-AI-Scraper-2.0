require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkTables() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const tables = ['projects', 'scraper_templates', 'scraping_jobs', 'scraped_data'];

  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.log(`❌ Table '${table}' not accessible: ${error.message}`);
      } else {
        console.log(`✅ Table '${table}' exists and is accessible`);
      }
    } catch (err) {
      console.log(`❌ Error checking table '${table}': ${err.message}`);
    }
  }
}

checkTables();