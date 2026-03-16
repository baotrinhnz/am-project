#!/usr/bin/env python3
"""Test script to verify Audd API connection and functionality"""

import os
import requests
import json
from dotenv import load_dotenv
import tempfile
import subprocess
import time

# Load environment variables
load_dotenv()

def test_audd_api():
    """Test the Audd API with a recorded audio sample"""

    api_token = os.getenv('AUDD_API_TOKEN')

    if not api_token:
        print("❌ Error: AUDD_API_TOKEN not found in .env file")
        return False

    print(f"✅ API Token found: {api_token[:10]}...")

    # Record a short audio sample
    print("\n📢 Recording 10 seconds of audio...")
    temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    temp_filename = temp_file.name
    temp_file.close()

    try:
        # Use plughw:3,0 which worked in previous tests
        cmd = [
            'arecord', '-D', 'plughw:3,0',
            '-f', 'S32_LE', '-r', '48000', '-c', '2',
            '-d', '10', temp_filename
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"❌ Recording failed: {result.stderr}")
            return False

        print(f"✅ Audio recorded to: {temp_filename}")
        file_size = os.path.getsize(temp_filename)
        print(f"   File size: {file_size:,} bytes")

        # Test the API
        print("\n🔍 Sending audio to Audd API for recognition...")

        with open(temp_filename, 'rb') as audio_file:
            files = {'file': audio_file}
            data = {
                'api_token': api_token,
                'return': 'apple_music,spotify'
            }

            try:
                response = requests.post(
                    'https://api.audd.io/',
                    data=data,
                    files=files,
                    timeout=30
                )

                print(f"✅ API Response Status: {response.status_code}")

                if response.status_code == 200:
                    result = response.json()
                    print("\n📋 API Response:")
                    print(json.dumps(result, indent=2))

                    if result.get('status') == 'success':
                        if result.get('result'):
                            song = result['result']
                            print(f"\n🎵 Song detected!")
                            print(f"   Title: {song.get('title', 'Unknown')}")
                            print(f"   Artist: {song.get('artist', 'Unknown')}")
                            print(f"   Album: {song.get('album', 'Unknown')}")
                            return True
                        else:
                            print("\n⚠️ No song detected in the audio")
                            return True  # API works, just no song detected
                    else:
                        print(f"\n❌ API Error: {result.get('error', {}).get('error_message', 'Unknown error')}")
                        return False
                else:
                    print(f"❌ HTTP Error: {response.text}")
                    return False

            except requests.exceptions.Timeout:
                print("❌ API request timed out")
                return False
            except requests.exceptions.RequestException as e:
                print(f"❌ API request failed: {e}")
                return False

    finally:
        # Clean up temp file
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
            print(f"\n🗑️ Cleaned up temporary file")

if __name__ == "__main__":
    print("🎵 Audd Music Recognition API Test")
    print("=" * 40)

    success = test_audd_api()

    print("\n" + "=" * 40)
    if success:
        print("✅ Audd API test completed successfully!")
    else:
        print("❌ Audd API test failed!")