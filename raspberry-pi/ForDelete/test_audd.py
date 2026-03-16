#!/usr/bin/env python3
"""
Test AudD Music Recognition API
================================
Simple test script to verify AudD API integration.
First test with a sample audio URL, then with local recording.
"""

import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent / ".env")

# AudD API configuration
AUDD_API_TOKEN = os.getenv("AUDD_API_TOKEN")

def test_with_url():
    """Test AudD API with a sample audio URL."""
    print("Testing AudD API with sample audio URL...")

    if not AUDD_API_TOKEN:
        print("ERROR: AUDD_API_TOKEN not found in .env file")
        print("Please add: AUDD_API_TOKEN=your_token_here")
        return False

    # Use AudD's test audio file
    data = {
        'url': 'https://audd.tech/example1.mp3',
        'api_token': AUDD_API_TOKEN,
        'return': 'spotify,apple_music'  # Get additional metadata
    }

    try:
        response = requests.post('https://api.audd.io/', data=data)
        result = response.json()

        print(f"\nAPI Response Status: {response.status_code}")
        print(f"API Result: {json.dumps(result, indent=2)}")

        if result['status'] == 'success' and result.get('result'):
            song = result['result']
            print(f"\n[SUCCESS] Song identified!")
            print(f"  Title: {song.get('title', 'Unknown')}")
            print(f"  Artist: {song.get('artist', 'Unknown')}")
            print(f"  Album: {song.get('album', 'Unknown')}")
            print(f"  Release: {song.get('release_date', 'Unknown')}")

            if song.get('spotify'):
                print(f"  Spotify: {song['spotify'].get('external_urls', {}).get('spotify', '')}")
            if song.get('apple_music'):
                print(f"  Apple Music: {song['apple_music'].get('url', '')}")

            print(f"\nFull response saved to: test_audd_response.json")
            with open('test_audd_response.json', 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2)

            return True
        else:
            print(f"[ERROR] Recognition failed: {result.get('error', {}).get('error_message', 'Unknown error')}")
            return False

    except Exception as e:
        print(f"[ERROR] Request failed: {e}")
        return False

def test_with_file(audio_file_path):
    """Test AudD API with a local audio file."""
    print(f"\nTesting with local file: {audio_file_path}")

    if not os.path.exists(audio_file_path):
        print(f"ERROR: File not found: {audio_file_path}")
        return False

    try:
        with open(audio_file_path, 'rb') as f:
            files = {'file': f}
            data = {
                'api_token': AUDD_API_TOKEN,
                'return': 'spotify,apple_music'
            }

            response = requests.post('https://api.audd.io/', data=data, files=files)
            result = response.json()

            if result['status'] == 'success' and result.get('result'):
                song = result['result']
                print(f"\n[SUCCESS] Song identified from local file!")
                print(f"  Title: {song.get('title', 'Unknown')}")
                print(f"  Artist: {song.get('artist', 'Unknown')}")
                return True
            else:
                print(f"[ERROR] Recognition failed: {result.get('error', {}).get('error_message', 'Unknown error')}")
                return False

    except Exception as e:
        print(f"[ERROR] Request failed: {e}")
        return False

def check_quota():
    """Check remaining quota for the API token."""
    print("\nChecking API quota...")

    data = {
        'api_token': AUDD_API_TOKEN,
        'method': 'get_quota'
    }

    try:
        response = requests.post('https://api.audd.io/', data=data)
        result = response.json()

        if result.get('status') == 'success':
            quota = result.get('quota', {})
            print(f"  Remaining requests: {quota.get('remaining', 'Unknown')}")
            print(f"  Used requests: {quota.get('used', 'Unknown')}")
            print(f"  Total limit: {quota.get('limit', 'Unknown')}")
        else:
            print(f"  Could not fetch quota info")

    except Exception as e:
        print(f"  Error checking quota: {e}")

if __name__ == "__main__":
    print("=" * 50)
    print("AudD Music Recognition API Test")
    print("=" * 50)

    # Test with URL first
    if test_with_url():
        print("\n[SUCCESS] API test successful!")
        check_quota()
    else:
        print("\n[FAILED] API test failed. Please check your API token.")
        print("\nTo get an API token:")
        print("1. Go to: https://dashboard.audd.io/")
        print("2. Sign up for free account")
        print("3. Copy your API token")
        print("4. Add to .env file: AUDD_API_TOKEN=your_token_here")

    # Optionally test with local file
    # test_with_file("recording.wav")