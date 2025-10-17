Write-Host "Database Schema Fix Tool" -ForegroundColor Green

if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_ANON_KEY) {
    Write-Host "Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables" -ForegroundColor Red
    exit 1
}

Write-Host "This will help you fix database schema issues:" -ForegroundColor Yellow
Write-Host "1. First, run the verification to see what's missing" -ForegroundColor White
Write-Host "2. Then, run the setup script in Supabase SQL Editor" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Choose option: (1) Verify schema, (2) Show setup SQL, (3) Both"

if ($choice -eq "1" -or $choice -eq "3") {
    Write-Host "`nRunning verification..." -ForegroundColor Cyan
    node scripts/verify-database.js
}

if ($choice -eq "2" -or $choice -eq "3") {
    Write-Host "`nSetup SQL for Supabase (open scripts/setup-schema.sql)" -ForegroundColor Cyan
    Get-Content scripts/setup-schema.sql | Write-Host
}
