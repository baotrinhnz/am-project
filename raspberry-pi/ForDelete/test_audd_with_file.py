#!/usr/bin/env python3
"""Test Audd API with specific testnow.wav file"""

import os
import requests
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_audd_with_file(file_path):
    """Test Audd API with specific audio file"""

    api_token = os.getenv('AUDD_API_TOKEN')

    if not api_token:
        print("❌ Error: AUDD_API_TOKEN not found in .env file")
        return False

    print(f"✅ API Token found: {api_token[:10]}...")

    if not os.path.exists(file_path):
        print(f"❌ Error: File not found: {file_path}")
        return False

    file_size = os.path.getsize(file_path)
    print(f"📁 Testing with file: {file_path}")
    print(f"   File size: {file_size:,} bytes")

    print("\n🔍 Sending audio to Audd API for recognition...")

    try:
        with open(file_path, 'rb') as audio_file:
            files = {'file': audio_file}
            data = {
                'api_token': api_token,
                'return': 'apple_music,spotify,deezer,musicbrainz'
            }

            response = requests.post(
                'https://api.audd.io/',
                data=data,
                files=files,
                timeout=30
            )

            print(f"✅ API Response Status: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print("\n📋 Full API Response:")
                print(json.dumps(result, indent=2))

                if result.get('status') == 'success':
                    if result.get('result'):
                        song = result['result']
                        print(f"\n🎵 Song detected!")
                        print(f"   Title: {song.get('title', 'Unknown')}")
                        print(f"   Artist: {song.get('artist', 'Unknown')}")
                        print(f"   Album: {song.get('album', 'Unknown')}")
                        print(f"   Release Date: {song.get('release_date', 'Unknown')}")
                        print(f"   Song Link: {song.get('song_link', 'N/A')}")

                        if song.get('spotify'):
                            print(f"\n   🎧 Spotify:")
                            spotify = song['spotify']
                            print(f"      Album: {spotify.get('album', {}).get('name', 'N/A')}")
                            print(f"      Artists: {', '.join([a.get('name', '') for a in spotify.get('artists', [])])}")
                            print(f"      Link: {spotify.get('external_urls', {}).get('spotify', 'N/A')}")

                        if song.get('apple_music'):
                            print(f"\n   🍎 Apple Music:")
                            apple = song['apple_music']
                            print(f"      Album: {apple.get('albumName', 'N/A')}")
                            print(f"      Genre: {', '.join(apple.get('genreNames', []))}")
                            print(f"      Link: {apple.get('url', 'N/A')}")

                        # Save full response
                        output_file = file_path.replace('.wav', '_audd_result.json')
                        with open(output_file, 'w') as f:
                            json.dump(result, f, indent=2)
                        print(f"\n💾 Full response saved to: {output_file}")

                        return True
                    else:
                        print("\n⚠️ No song detected in the audio")
                        print("   This could mean:")
                        print("   - No music is playing in the recording")
                        print("   - The music is too quiet or unclear")
                        print("   - The song is not in Audd's database")
                        return True  # API works, just no song detected
                else:
                    error_msg = result.get('error', {}).get('error_message', 'Unknown error')
                    print(f"\n❌ API Error: {error_msg}")
                    return False
            else:
                print(f"❌ HTTP Error: {response.text}")
                return False

    except requests.exceptions.Timeout:
        print("❌ API request timed out")
        return False
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False

if __name__ == "__main__":
    print("🎵 Audd Music Recognition API Test with testnow.wav")
    print("=" * 50)

    # Test with testnow.wav
    success = test_audd_with_file("testnow.wav")

    print("\n" + "=" * 50)
    if success:
        print("✅ Test completed successfully!")
    else:
        print("❌ Test failed!")