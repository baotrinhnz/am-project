# Load environment variables
$envContent = Get-Content "$PSScriptRoot\..\raspberry-pi\.env"
$env:SUPABASE_URL = ($envContent | Select-String "SUPABASE_URL=(.+)").Matches.Groups[1].Value
$env:SUPABASE_SERVICE_KEY = ($envContent | Select-String "SUPABASE_SERVICE_KEY=(.+)").Matches.Groups[1].Value

if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_KEY) {
    Write-Host "Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY" -ForegroundColor Red
    exit 1
}

# Read SQL file
$sqlContent = Get-Content "$PSScriptRoot\migrations\001_device_settings.sql" -Raw

Write-Host "Running migration: 001_device_settings.sql" -ForegroundColor Cyan
Write-Host "Supabase URL: $env:SUPABASE_URL" -ForegroundColor Gray

# Execute SQL using Supabase REST API
$headers = @{
    "apikey" = $env:SUPABASE_SERVICE_KEY
    "Authorization" = "Bearer $env:SUPABASE_SERVICE_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    query = $sqlContent
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$env:SUPABASE_URL/rest/v1/rpc/query" -Method Post -Headers $headers -Body $body
    Write-Host "Migration executed successfully!" -ForegroundColor Green
    Write-Host "Table 'device_settings' created" -ForegroundColor Green
} catch {
    Write-Host "Error executing migration:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
