Write-Host "🧪 PowerShell Local CI Simulation (Windows)" -ForegroundColor Green

# Ensure directories for reports exist
$null = New-Item -ItemType Directory -Force -Path "test-results/junit" | Out-Null
$null = New-Item -ItemType Directory -Force -Path "test-results/eslint" | Out-Null

function Invoke-LocalStubbedTests {
    Write-Host "🔧 Running stubbed tests with advanced reporting..." -ForegroundColor Yellow

    $env:NODE_ENV = 'test'
    Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:REDIS_URL -ErrorAction SilentlyContinue

    Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
    npm ci --no-audit --no-fund

    Write-Host "📝 Running ESLint (checkstyle)..." -ForegroundColor Cyan
    npx eslint . --ext .js --max-warnings 0 --format checkstyle --output-file ./test-results/eslint/results.xml

    Write-Host "🧪 Running unit tests (jest-junit)..." -ForegroundColor Cyan
    npx jest tests/unit/ --reporters=default --reporters=jest-junit --coverage

    Write-Host "🔗 Running integration tests (stubbed)..." -ForegroundColor Cyan
    try {
        npx jest tests/integration/ --reporters=default --reporters=jest-junit
    } catch {
        Write-Host "(integration tests may be skipped if not configured)" -ForegroundColor Yellow
    }

    Write-Host "✅ Stubbed tests completed" -ForegroundColor Green
}

function Invoke-LocalIntegrationTests {
    Write-Host "🔧 Running integration tests..." -ForegroundColor Yellow

    $env:NODE_ENV = 'test'
    $env:REDIS_URL = 'redis://localhost:6379'

    # Basic Redis check
    try {
        $redisCheck = & redis-cli ping 2>$null
        if ($redisCheck -ne 'PONG') {
            Write-Host "❌ Redis is not running. Start with: docker run -d -p 6379:6379 redis:alpine" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "❌ Redis is not running. Start with: docker run -d -p 6379:6379 redis:alpine" -ForegroundColor Red
        exit 1
    }

    npx jest --reporters=default --reporters=jest-junit --coverage --coverageReporters=lcov --coverageReporters=text --coverageReporters=html

    Write-Host "✅ Integration tests completed" -ForegroundColor Green
}

function Show-ReportSummary {
    Write-Host "`n📈 TEST REPORT SUMMARY`n" -ForegroundColor Magenta

    $currentDir = (Get-Location).Path
    if (Test-Path "coverage/lcov.info") {
        Write-Host "📊 Coverage Report: file://$currentDir/coverage/lcov-report/index.html" -ForegroundColor Cyan
    }
    if (Test-Path "test-results/junit") {
        Write-Host "📋 Test Results: file://$currentDir/test-results/junit/" -ForegroundColor Cyan
    }
    if (Test-Path "test-results/eslint/results.xml") {
        Write-Host "🔍 ESLint: file://$currentDir/test-results/eslint/results.xml" -ForegroundColor Cyan
    }
}

# Main
$mode = if ($args.Count -gt 0) { $args[0].ToLower() } else { 'stubbed' }
switch ($mode) {
    'stubbed' { 
        Invoke-LocalStubbedTests
        Show-ReportSummary
    }
    'integration' {
        Invoke-LocalIntegrationTests
        Show-ReportSummary
    }
    'all' {
        Invoke-LocalStubbedTests
        Invoke-LocalIntegrationTests
        Show-ReportSummary
    }
    'report' {
        Show-ReportSummary
    }
    default {
        Write-Host "Usage: .\local-ci-windows.ps1 {stubbed|integration|all|report}" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "`n🎉 PowerShell Local CI simulation complete!" -ForegroundColor Green
