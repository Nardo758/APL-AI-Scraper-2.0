$env:DIRECT_URL = 'postgresql://postgres.jdymvpasjsdbryatscux:Mama%40%24_5030@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
Write-Host "Running DB connection test using DIRECT_URL..."
node .\scripts\test-pg-connection.js
