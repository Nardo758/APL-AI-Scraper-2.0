require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkSchema() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    // Check if tables exist in information_schema
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: 'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' AND table_name IN (\'projects\', \'scraper_templates\', \'scraping_jobs\', \'scraped_data\')'
    });

    if (error) {
      console.log('Error querying information_schema:', error.message);
    } else {
      console.log('Tables found:', data);
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

checkSchema();