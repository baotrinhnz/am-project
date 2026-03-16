# ============================================================================
# Auto-Detect Raspberry Pi and Fix Noise Sensor
# ============================================================================
# This script will:
# 1. Scan local network for Raspberry Pi
# 2. SSH into the Pi
# 3. Run the noise sensor fix script
# 4. Show results
#
# Usage:
#   Right-click → Run with PowerShell
#   OR
#   powershell -ExecutionPolicy Bypass -File fix-pi-noise-sensor.ps1
# ============================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Raspberry Pi Noise Sensor Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if plink (PuTTY) is available, otherwise use OpenSSH
$sshCommand = "ssh"
if (Get-Command plink -ErrorAction SilentlyContinue) {
    $sshCommand = "plink"
}

# Common Raspberry Pi hostnames to try
$piHosts = @(
    "raspberrypi.local",
    "raspberrypi",
    "rpi-enviro-01.local",
    "rpi-enviro-01"
)

# Common usernames
$possibleUsers = @("pi", "am", "admin")

Write-Host "[1/4] Detecting Raspberry Pi on network..." -ForegroundColor Yellow
Write-Host ""

$piFound = $false
$piHost = ""
$piUser = ""

# Try common hostnames first
foreach ($host in $piHosts) {
    Write-Host "  Trying $host..." -NoNewline
    $ping = Test-Connection -ComputerName $host -Count 1 -Quiet -ErrorAction SilentlyContinue

    if ($ping) {
        Write-Host " Found!" -ForegroundColor Green
        $piHost = $host
        $piFound = $true
        break
    } else {
        Write-Host " Not found" -ForegroundColor Gray
    }
}

# If not found by hostname, scan local network
if (-not $piFound) {
    Write-Host ""
    Write-Host "Scanning local network (this may take 30-60 seconds)..." -ForegroundColor Yellow

    # Get local IP range
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -like "192.168.*"})[0].IPAddress

    if ($localIP) {
        $subnet = $localIP.Substring(0, $localIP.LastIndexOf('.'))
        Write-Host "Scanning subnet: $subnet.0/24"

        # Quick scan common Raspberry Pi ports
        1..254 | ForEach-Object -Parallel {
            $ip = "$using:subnet.$_"
            $test = Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSeconds 1 -ErrorAction SilentlyContinue
            if ($test) {
                # Test SSH port
                $tcpClient = New-Object System.Net.Sockets.TcpClient
                try {
                    $tcpClient.ConnectAsync($ip, 22).Wait(500) | Out-Null
                    if ($tcpClient.Connected) {
                        return $ip
                    }
                } catch {}
                finally {
                    $tcpClient.Close()
                }
            }
        } -ThrottleLimit 20 | ForEach-Object {
            if ($_ -and -not $piFound) {
                Write-Host "  Found device with SSH at: $_" -ForegroundColor Green
                $script:piHost = $_
                $script:piFound = $true
            }
        }
    }
}

if (-not $piFound) {
    Write-Host ""
    Write-Host "❌ Could not detect Raspberry Pi automatically" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please enter manually:" -ForegroundColor Yellow
    $piHost = Read-Host "Raspberry Pi IP or hostname (e.g., 192.168.1.100 or raspberrypi.local)"

    if ([string]::IsNullOrWhiteSpace($piHost)) {
        Write-Host "No hostname provided. Exiting." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "✓ Raspberry Pi detected: $piHost" -ForegroundColor Green
Write-Host ""

# Ask for username
Write-Host "[2/4] SSH Login Configuration" -ForegroundColor Yellow
Write-Host ""
Write-Host "Common usernames: pi, am, admin"
$piUser = Read-Host "Enter SSH username (default: pi)"
if ([string]::IsNullOrWhiteSpace($piUser)) {
    $piUser = "pi"
}

Write-Host ""
Write-Host "[3/4] Connecting to Raspberry Pi..." -ForegroundColor Yellow
Write-Host "Host: $piHost"
Write-Host "User: $piUser"
Write-Host ""
Write-Host "You will be prompted for password in a moment..."
Start-Sleep -Seconds 2

# Build SSH command to run fix script
$remoteCommand = @"
echo '========================================='
echo '  Running Noise Sensor Fix Script'
echo '========================================='
echo ''
cd ~
curl -sSL https://raw.githubusercontent.com/baotrinhnz/am-project/main/raspberry-pi/fix_noise_sensor.sh -o /tmp/fix_noise.sh
sudo bash /tmp/fix_noise.sh
rm /tmp/fix_noise.sh
echo ''
echo 'Press Enter to close...'
read
"@

# Execute SSH command
Write-Host ""
Write-Host "[4/4] Executing fix script on Pi..." -ForegroundColor Yellow
Write-Host ""

if ($sshCommand -eq "plink") {
    # Using PuTTY plink
    echo $remoteCommand | plink -batch $piUser@$piHost
} else {
    # Using OpenSSH
    ssh -t "$piUser@$piHost" $remoteCommand
}

$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($exitCode -eq 0) {
    Write-Host "  ✅ Fix completed successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Wait 1-2 minutes for Pi to restart service"
    Write-Host "  2. Open dashboard: https://am-beta-ten.vercel.app"
    Write-Host "  3. Check 'Light & Sound' section for Noise readings"
    Write-Host ""
} else {
    Write-Host "  ⚠️  Script completed with warnings" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Check the output above for any errors."
    Write-Host "You may need to:"
    Write-Host "  - Check SSH credentials"
    Write-Host "  - Ensure Pi is connected to internet"
    Write-Host "  - Run manually: ssh $piUser@$piHost"
    Write-Host ""
}

Write-Host "Press Enter to close..."
Read-Host
