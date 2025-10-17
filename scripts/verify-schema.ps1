Write-Host "🔍 Database Schema Verification" -ForegroundColor Green

# Check if environment variables are set
if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_ANON_KEY) {
    Write-Host "❌ Supabase environment variables not set" -ForegroundColor Red
    Write-Host "   Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Supabase environment variables found" -ForegroundColor Green

# Run the verification script
node -e "
const DatabaseVerifier = require('./scripts/verify-database');
const verifier = new DatabaseVerifier();

async function runVerification() {
    try {
        const report = await verifier.generateSchemaReport();
        console.log('\\n📊 DATABASE SCHEMA REPORT');
        console.log('========================\\n');
        
        // Connection status
        console.log('🔌 Connection:');
        console.log('   URL:', report.connection.url);
        console.log('   Key:', report.connection.key);
        console.log('   Connected:', report.connection.connected ? '✅ Yes' : '❌ No');
        console.log('');
        
        // Schema status
        console.log('🏗️  Schema:');
        console.log('   Matches expected:', report.schema.schemaMatches ? '✅ Yes' : '❌ No');
        if (report.schema.missingTables.length > 0) {
            console.log('   Missing tables:', report.schema.missingTables.join(', '));
        }
        console.log('');
        
        // Record counts
        console.log('📈 Record Counts:');
        Object.entries(report.recordCounts).forEach(([table, count]) => {
            console.log('   ' + table + ': ' + count);
        });
        console.log('');
        
        // Recommendations
        if (report.recommendations.length > 0) {
            console.log('💡 Recommendations:');
            report.recommendations.forEach(rec => {
                const icon = rec.severity === 'high' ? '❌' : '⚠️';
                console.log('   ' + icon + ' ' + rec.message);
                console.log('      Action: ' + rec.action);
            });
        } else {
            console.log('✅ No issues found - schema matches expected structure');
        }
        
    } catch (error) {
        console.error('Verification failed:', error);
    }
}

runVerification();
"
