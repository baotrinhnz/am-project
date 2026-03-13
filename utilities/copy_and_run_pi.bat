@echo off
echo ======================================
echo  Copy and Run Music Service on Pi
echo ======================================
echo.

echo Copying files to Pi (am@10.0.1.243)...
echo Password is: amam
echo.

REM Copy necessary files
scp raspberry-pi/music_recognizer.py am@10.0.1.243:~/
scp raspberry-pi/music_manual_trigger.py am@10.0.1.243:~/
scp raspberry-pi/sensor_reader.py am@10.0.1.243:~/
scp raspberry-pi/.env am@10.0.1.243:~/

echo.
echo Files copied! Now SSH to run the service...
echo.

echo ======================================
echo Run these commands after SSH:
echo ======================================
echo pkill -f music_manual_trigger.py
echo python3 music_manual_trigger.py
echo ======================================
echo.

ssh am@10.0.1.243

pause