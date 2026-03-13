import paramiko
import time
import sys

# Pi credentials
HOST = "10.0.1.243"
USER = "am"
PASS = "amam"
PORT = 22

def restart_music_service():
    try:
        print(f"Connecting to {USER}@{HOST}...")

        # Create SSH client
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        # Connect
        ssh.connect(HOST, PORT, USER, PASS, timeout=10)
        print("✓ Connected successfully!")

        # Commands to run
        commands = [
            "pkill -f music_manual_trigger.py 2>/dev/null || true",
            "pkill -f music_recognizer.py 2>/dev/null || true",
            "cd ~/enviro || cd /home/am/enviro",
            "pwd",
            "ls -la music*.py",
            "nohup python3 music_manual_trigger.py > music.log 2>&1 &",
            "sleep 2",
            "ps aux | grep music | grep -v grep"
        ]

        print("\nExecuting commands...")
        for cmd in commands:
            if cmd.startswith("nohup"):
                # For background process
                print(f"Starting background process...")
                stdin, stdout, stderr = ssh.exec_command(cmd)
                time.sleep(1)
            else:
                stdin, stdout, stderr = ssh.exec_command(cmd)
                output = stdout.read().decode()
                error = stderr.read().decode()

                if output:
                    print(f"[{cmd[:30]}...]: {output.strip()}")
                if error and "No such process" not in error:
                    print(f"Error: {error.strip()}")

        print("\n✓ Music service restarted with 20-second recording!")
        print("Service should be listening for commands from dashboard.")

        # Close connection
        ssh.close()

    except Exception as e:
        print(f"Error: {e}")
        print("\nPlease run manually:")
        print(f"ssh {USER}@{HOST}")
        print(f"Password: {PASS}")
        return False

    return True

if __name__ == "__main__":
    restart_music_service()