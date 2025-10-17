Write-Host "PowerShell Local CI Simulation (Windows)" -ForegroundColor Green

# Create test results directories
New-Item -ItemType Directory -Force -Path "test-results/junit" | Out-Null
New-Item -ItemType Directory -Force -Path "test-results/eslint" | Out-Null

function Run-StubbedTests {
    Write-Host "Running stubbed tests..." -ForegroundColor Yellow
    
    # Set environment for stubbed mode
    $env:NODE_ENV = "test"
    $env:SUPABASE_URL = ""
    $env:SUPABASE_ANON_KEY = ""
    $env:REDIS_URL = ""
    
    # Install dependencies
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm ci --no-audit --no-fund
    
    # ESLint
    Write-Host "Running ESLint..." -ForegroundColor Cyan
    npx eslint . --ext .js --max-warnings 0
    
    # Unit tests
    Write-Host "Running unit tests..." -ForegroundColor Cyan
    npx jest tests/unit/ --reporters=default --reporters=jest-junit --coverage
    
    # Integration tests
    Write-Host "Running integration tests..." -ForegroundColor Cyan
    npx jest tests/integration/ --reporters=default --reporters=jest-junit
    
    Write-Host "Stubbed tests completed" -ForegroundColor Green
}

function Generate-ReportSummary {
    Write-Host ""
    Write-Host "TEST REPORT SUMMARY" -ForegroundColor Magenta
    Write-Host "==================" -ForegroundColor Magenta
    
    $currentDir = Get-Location
    
    if (Test-Path "coverage/lcov.info") {
        Write-Host "Coverage Report:" -ForegroundColor Cyan
        Write-Host "  - HTML: file://$currentDir/coverage/lcov-report/index.html" -ForegroundColor White
    }
    
    if (Test-Path "test-results/junit") {
        Write-Host "Test Results:" -ForegroundColor Cyan
        Write-Host "  - JUnit: file://$currentDir/test-results/junit/" -ForegroundColor White
    }
    
    Write-Host ""
}

# Main execution
$mode = $args[0]
if (-not $mode) { $mode = "report" }

switch ($mode) {
    "stubbed" {
        Run-StubbedTests
        Generate-ReportSummary
    }
    "report" {
        Generate-ReportSummary
    }
    default {
        Write-Host "Usage: .\local-ci.ps1 {stubbed|report}" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Local CI simulation complete" -ForegroundColor Green
