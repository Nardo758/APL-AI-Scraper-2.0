param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('stubbed','real','all','report')]
    [string]$Mode = 'stubbed',

    [switch]$WhatIf
)

Write-Host "🧪 PowerShell Local CI Simulation (Windows) - Mode: $Mode" -ForegroundColor Green

# ensure directories
New-Item -ItemType Directory -Force -Path "test-results/junit" | Out-Null
New-Item -ItemType Directory -Force -Path "test-results/eslint" | Out-Null

function Invoke-StubbedTests {
    Write-Host "🔧 Running stubbed tests (dry=$WhatIf)..." -ForegroundColor Yellow
    if ($WhatIf) { Write-Host "WhatIf: would run npm ci, eslint, jest" -ForegroundColor Cyan; return }

    $env:NODE_ENV = 'test'
    Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:REDIS_URL -ErrorAction SilentlyContinue

    npm ci --no-audit --no-fund
    npx eslint . --ext .js --max-warnings 0 --format checkstyle --output-file ./test-results/eslint/results.xml
    npx jest tests/unit/ --reporters=default --reporters=jest-junit --coverage
    try { npx jest tests/integration/ --reporters=default --reporters=jest-junit } catch { Write-Host "Integration tests skipped or failed" -ForegroundColor Yellow }
    Write-Host "✅ Stubbed tests completed" -ForegroundColor Green
}

function Invoke-RealTests {
    param([switch]$UseDocker)
    Write-Host "🔧 Running real tests (useDocker=$UseDocker, dry=$WhatIf)..." -ForegroundColor Yellow
    if ($WhatIf) { Write-Host "WhatIf: would start docker redis and run full tests" -ForegroundColor Cyan; return }

    $env:NODE_ENV = 'test'
    if ($UseDocker) {
        $containerId = docker run -d -p 6379:6379 --name redis-ci redis:alpine
        Start-Sleep -Seconds 2
    }

    try {
        # Wait for redis
        $attempt=0; while ($attempt -lt 10) {
            try { $pong = docker exec redis-ci redis-cli ping 2>$null } catch { $pong = '' }
            if ($pong -eq 'PONG') { break }
            Start-Sleep -Seconds 1; $attempt++
        }

        npx jest --ci --reporters=default --reporters=jest-junit --coverage --coverageReporters=lcov --coverageReporters=text --coverageReporters=html
    } finally {
        if ($UseDocker -and $containerId) {
            docker stop $containerId | Out-Null
            docker rm $containerId | Out-Null
        }
    }

    Write-Host "✅ Real tests completed" -ForegroundColor Green
}

function Show-ReportSummary {
    Write-Host "`n📈 TEST REPORT SUMMARY`n" -ForegroundColor Magenta
    $cwd = (Get-Location).Path
    if (Test-Path "coverage/lcov-report/index.html") { Write-Host "Coverage: file://$cwd/coverage/lcov-report/index.html" -ForegroundColor Cyan }
    if (Test-Path "test-results/junit") { Write-Host "Test results: $cwd/test-results/junit/" -ForegroundColor Cyan }
}

switch ($Mode) {
    'stubbed' { Invoke-StubbedTests; Show-ReportSummary }
    'real'   { Invoke-RealTests -UseDocker; Show-ReportSummary }
    'all'    { Invoke-StubbedTests; Invoke-RealTests -UseDocker; Show-ReportSummary }
    'report' { Show-ReportSummary }
}

Write-Host "`n🎉 PowerShell Local CI simulation complete!" -ForegroundColor Green
