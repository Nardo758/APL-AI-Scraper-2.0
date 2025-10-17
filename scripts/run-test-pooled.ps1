param(
  [string]$PooledUrl
)

# If not provided, read from env var
if (-not $PooledUrl) {
  $PooledUrl = $env:DATABASE_URL
}

if (-not $PooledUrl) {
  Write-Host "DATABASE_URL not provided. Provide via -PooledUrl parameter or set DATABASE_URL env var."
  exit 2
}

# Set env var for Node script
$env:DATABASE_URL = $PooledUrl

Write-Host "Using pooled DATABASE_URL: $PooledUrl"

# Run the Node test script which uses pg
node .\scripts\test-pg-connection.js --use-pool

if ($LASTEXITCODE -ne 0) {
  Write-Host "Pooled DB test failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Pooled DB test completed."
