# Raspberry Pi SSH Configuration

## Connection Details
- **IP Address:** 10.0.1.243
- **Username:** am
- **Password:** amam
- **Port:** 22 (default)

## SSH Commands

### Connect to Pi:
```bash
ssh am@10.0.1.243
# Password: amam
```

### Copy files to Pi:
```bash
scp file.py am@10.0.1.243:~/
```

### Project location on Pi:
```bash
cd ~/
# or
cd /home/am/
# NOTE: Files are in home directory, NOT in enviro folder!
```

## Quick Commands

### Restart music service:
```bash
ssh am@10.0.1.243 "pkill -f music_manual_trigger.py; cd ~/ && nohup python3 music_manual_trigger.py > music.log 2>&1 &"
```

### Check service status:
```bash
ssh am@10.0.1.243 "ps aux | grep music"
```

### View logs:
```bash
ssh am@10.0.1.243 "tail -f ~/music.log"
```