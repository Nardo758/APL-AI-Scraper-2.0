require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function applySchema() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    // Read the schema file
    const schemaSQL = fs.readFileSync('scripts/setup-schema.sql', 'utf8');

    // Split into individual statements
    const statements = schemaSQL.split(';').filter(stmt => stmt.trim().length > 0);

    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.trim().substring(0, 50) + '...');
        const { error } = await supabase.rpc('exec', { query: statement.trim() });

        if (error) {
          console.log('Error:', error.message);
        } else {
          console.log('Success');
        }
      }
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

applySchema();