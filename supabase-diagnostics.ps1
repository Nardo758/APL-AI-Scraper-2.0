Write-Host " SUPABASE CONNECTION DIAGNOSTICS" -ForegroundColor Magenta
Write-Host "===================================" -ForegroundColor Magenta

# 1) Check environment variables
Write-Host "`n1. ENVIRONMENT VARIABLES CHECK:" -ForegroundColor Cyan
Write-Host "SUPABASE_URL: $env:SUPABASE_URL" -ForegroundColor White

if ($env:SUPABASE_SERVICE_ROLE_KEY) {
    $k = $env:SUPABASE_SERVICE_ROLE_KEY
    Write-Host "SERVICE_ROLE_KEY length: $($k.Length)" -ForegroundColor White
    Write-Host "SERVICE_ROLE_KEY preview: $($k.Substring(0,10))...$($k.Substring($k.Length-10))" -ForegroundColor White
} elseif ($env:SUPABASE_ANON_KEY) {
    $k = $env:SUPABASE_ANON_KEY  
    Write-Host "ANON_KEY length: $($k.Length)" -ForegroundColor White
    Write-Host "ANON_KEY preview: $($k.Substring(0,10))...$($k.Substring($k.Length-10))" -ForegroundColor White
} else {
    Write-Host " No SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY set in this shell" -ForegroundColor Red
    $k = $null
}

# 2) Decode JWT payload to verify key structure
Write-Host "`n2. JWT TOKEN ANALYSIS:" -ForegroundColor Cyan
function Decode-JWTPayload($jwt){
    if(-not $jwt){ 
        Write-Host "No JWT supplied" -ForegroundColor Yellow
        return 
    }
    
    $parts = $jwt -split '\.'
    if ($parts.Length -lt 3) { 
        Write-Host " Not a valid JWT (expected 3 parts, got $($parts.Length))" -ForegroundColor Red
        return 
    }
    
    $payload = $parts[1] -replace '-','+' -replace '_','/'
    switch ($payload.Length % 4) { 
        0 {} 
        2 { $payload += '==' } 
        3 { $payload += '=' } 
        default {} 
    }
    
    try {
        $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))
        Write-Host " JWT payload decoded successfully:" -ForegroundColor Green
        Write-Host $json -ForegroundColor White
    } catch { 
        Write-Host " Failed to decode JWT payload: $_" -ForegroundColor Red
    }
}

if ($k) { 
    Decode-JWTPayload $k 
} else {
    Write-Host "Skipping JWT analysis - no key available" -ForegroundColor Yellow
}

# 3) Test REST API connection
Write-Host "`n3. REST API CONNECTION TEST:" -ForegroundColor Cyan
if ($k -and $env:SUPABASE_URL) {
    $headers = @{ 
        "apikey" = $k
        "Authorization" = "Bearer $k"
        "Content-Type" = "application/json"
    }
    
    try {
        Write-Host "Testing connection to: $($env:SUPABASE_URL)/rest/v1/" -ForegroundColor White
        $resp = Invoke-RestMethod -Uri "$($env:SUPABASE_URL)/rest/v1/" -Headers $headers -Method Get -ErrorAction Stop -TimeoutSec 10
        Write-Host " REST API call succeeded - Key is valid!" -ForegroundColor Green
        Write-Host "Response indicates Supabase accepted the authentication" -ForegroundColor White
    } catch {
        Write-Host " REST API call failed: $($_.Exception.Message)" -ForegroundColor Red
        
        # Check for specific HTTP status codes
        if ($_.Exception.Response -ne $null) {
            $statusCode = $_.Exception.Response.StatusCode.value__
            Write-Host "HTTP Status Code: $statusCode" -ForegroundColor Yellow
            
            switch ($statusCode) {
                401 { Write-Host " 401 Unauthorized - Invalid API key" -ForegroundColor Red }
                403 { Write-Host " 403 Forbidden - Key valid but insufficient permissions" -ForegroundColor Yellow }
                404 { Write-Host " 404 Not Found - Project URL might be incorrect" -ForegroundColor Yellow }
                422 { Write-Host " 422 Unprocessable - API key format issue" -ForegroundColor Yellow }
                default { Write-Host " Unexpected HTTP error" -ForegroundColor Red }
            }
        }
    }
} else {
    Write-Host "Skipping REST test - missing URL or key" -ForegroundColor Yellow
}

# 4) Test Project Metadata Endpoint (more reliable)
Write-Host "`n4. PROJECT METADATA TEST:" -ForegroundColor Cyan
if ($k -and $env:SUPABASE_URL) {
    try {
        $headers = @{ 
            "apikey" = $k
            "Authorization" = "Bearer $k"
        }
        
        # Try the health endpoint which should work with any valid key
        $healthUrl = "$($env:SUPABASE_URL)/rest/v1/"
        Write-Host "Testing: $healthUrl" -ForegroundColor White
        
        $resp = Invoke-WebRequest -Uri $healthUrl -Headers $headers -Method Get -ErrorAction Stop -TimeoutSec 10
        
        Write-Host " Project metadata endpoint accessible!" -ForegroundColor Green
        Write-Host "Status: $($resp.StatusCode) $($resp.StatusDescription)" -ForegroundColor White
        
    } catch {
        Write-Host " Project metadata test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 5) Check if we can connect via the Supabase JS client
Write-Host "`n5. SUPABASE JS CLIENT TEST:" -ForegroundColor Cyan
if ($k -and $env:SUPABASE_URL) {
    try {
        $testScript = @"
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('$env:SUPABASE_URL', '$k');
        
async function test() {
    try {
        const { data, error } = await supabase.from('projects').select('*').limit(1);
        if (error) {
            console.log('JS Client Error: ' + error.message);
            console.log('Error Code: ' + error.code);
            process.exit(1);
        } else {
            console.log(' JS Client connected successfully!');
            console.log('Projects table accessible');
            process.exit(0);
        }
    } catch (err) {
        console.log('JS Client Exception: ' + err.message);
        process.exit(1);
    }
}
test();
"@
        
        $tempFile = "temp_test.js"
        $testScript | Out-File -FilePath $tempFile -Encoding utf8
        Write-Host "Testing Supabase JS client connection..." -ForegroundColor White
        node $tempFile
        Remove-Item $tempFile -Force
    } catch {
        Write-Host " JS client test failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host "Skipping JS client test - missing URL or key" -ForegroundColor Yellow
}

Write-Host "`n DIAGNOSTICS COMPLETE" -ForegroundColor Magenta
Write-Host "=====================" -ForegroundColor Magenta
