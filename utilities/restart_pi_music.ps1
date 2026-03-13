# PowerShell script to restart music service on Raspberry Pi

$piHost = "10.0.1.243"
$piUser = "am"
$piPass = "amam"

Write-Host "Restarting music service on Raspberry Pi..." -ForegroundColor Yellow

# Using plink (PuTTY) if available, or ssh
$commands = @(
    "pkill -f music_manual_trigger.py 2>/dev/null"
    "pkill -f music_recognizer.py 2>/dev/null"
    "cd ~/enviro || cd /home/am/enviro"
    "nohup python3 music_manual_trigger.py > music.log 2>&1 &"
    "sleep 2"
    "ps aux | grep music | grep -v grep"
)

$fullCommand = $commands -join " ; "

# Try using ssh with sshpass if available
if (Get-Command sshpass -ErrorAction SilentlyContinue) {
    sshpass -p $piPass ssh -o StrictHostKeyChecking=no $piUser@$piHost "$fullCommand"
} else {
    Write-Host "Please run these commands manually on the Pi:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ssh $piUser@$piHost" -ForegroundColor Green
    Write-Host "Password: $piPass" -ForegroundColor Green
    Write-Host ""
    foreach ($cmd in $commands) {
        Write-Host $cmd -ForegroundColor White
    }
}

Write-Host ""
Write-Host "To check if service is running:" -ForegroundColor Yellow
Write-Host "ssh $piUser@$piHost 'ps aux | grep music'" -ForegroundColor Green