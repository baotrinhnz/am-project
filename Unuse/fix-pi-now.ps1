# Simple Raspberry Pi Noise Sensor Fix
# Run: powershell -ExecutionPolicy Bypass -File fix-pi-now.ps1

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " Raspberry Pi Noise Sensor Fix" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Try common Pi hostnames
$hosts = @("raspberrypi.local", "raspberrypi", "rpi-enviro-01.local", "rpi-enviro-01")
$piHost = ""

Write-Host "[1/3] Detecting Raspberry Pi..." -ForegroundColor Yellow
foreach ($h in $hosts) {
    Write-Host "  Trying $h..." -NoNewline
    if (Test-Connection -ComputerName $h -Count 1 -Quiet -ErrorAction SilentlyContinue) {
        Write-Host " Found!" -ForegroundColor Green
        $piHost = $h
        break
    }
    Write-Host " Not found" -ForegroundColor Gray
}

if ([string]::IsNullOrEmpty($piHost)) {
    Write-Host ""
    $piHost = Read-Host "Enter Pi hostname or IP (e.g., 192.168.1.100)"
}

Write-Host ""
Write-Host "[2/3] SSH Configuration" -ForegroundColor Yellow
$piUser = Read-Host "SSH username (default: pi)"
if ([string]::IsNullOrWhiteSpace($piUser)) { $piUser = "pi" }

Write-Host ""
Write-Host "[3/3] Running fix on $piHost..." -ForegroundColor Yellow
Write-Host "(You'll be prompted for password)" -ForegroundColor Gray
Write-Host ""

# Create simple bash script
$script = "cd ~ && curl -sSL https://raw.githubusercontent.com/baotrinhnz/am-project/main/raspberry-pi/fix_noise_sensor.sh -o /tmp/fix.sh && sudo bash /tmp/fix.sh"

# Run via SSH
ssh -t "$piUser@$piHost" $script

Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Fix completed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Open dashboard: https://am-beta-ten.vercel.app" -ForegroundColor Cyan
    Write-Host "Check 'Light & Sound' section for Noise readings" -ForegroundColor Cyan
} else {
    Write-Host "⚠️ Error occurred. Check output above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press Enter to close..."
Read-Host
