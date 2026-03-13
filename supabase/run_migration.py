#!/usr/bin/env python3
import os
import requests
from pathlib import Path

# Load environment variables
env_file = Path(__file__).parent.parent / 'raspberry-pi' / '.env'
env_vars = {}
with open(env_file) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            env_vars[key] = value

SUPABASE_URL = env_vars.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = env_vars.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file')
    exit(1)

# Read SQL migration file
sql_file = Path(__file__).parent / 'migrations' / '001_device_settings.sql'
sql = sql_file.read_text(encoding='utf-8')

# Split SQL into individual statements
statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]

print('🔄 Running migration: 001_device_settings.sql')
print(f'📡 Supabase URL: {SUPABASE_URL}')
print(f'📝 Total statements: {len(statements)}')
print()

# Execute each statement
headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

success_count = 0
for i, statement in enumerate(statements, 1):
    # Skip empty statements and comments
    if not statement or statement.startswith('--'):
        continue

    print(f'[{i}/{len(statements)}] Executing statement...')

    # Use PostgREST query endpoint
    response = requests.post(
        f'{SUPABASE_URL}/rest/v1/rpc/exec_sql',
        headers=headers,
        json={'query': statement}
    )

    if response.status_code in [200, 201, 204]:
        print(f'  ✅ Success')
        success_count += 1
    else:
        print(f'  ⚠️  Status {response.status_code}: {response.text}')

print()
print(f'✅ Migration completed: {success_count}/{len(statements)} statements executed')
print('✅ Table "device_settings" should now be available')
