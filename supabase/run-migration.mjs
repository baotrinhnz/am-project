import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment from raspberry-pi/.env
const envPath = join(__dirname, '../raspberry-pi/.env');
const envContent = readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const [key, ...valueParts] = trimmed.split('=');
    envVars[key] = valueParts.join('=');
  }
});

const SUPABASE_URL = envVars.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envVars.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Read SQL migration
const sqlPath = join(__dirname, 'migrations/001_device_settings.sql');
const sql = readFileSync(sqlPath, 'utf8');

console.log('🔄 Running migration: 001_device_settings.sql');
console.log(`📡 Supabase URL: ${SUPABASE_URL}`);

// Split into statements and execute
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

console.log(`📝 Total statements: ${statements.length}\n`);

let successCount = 0;

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i];
  if (!statement) continue;

  console.log(`[${i + 1}/${statements.length}] Executing...`);

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql: statement + ';' });

    if (error) {
      // Try direct SQL execution if rpc fails
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ query: statement + ';' })
      });

      if (!response.ok) {
        console.log(`  ⚠️  Warning: ${error.message || 'May already exist'}`);
      } else {
        console.log('  ✅ Success');
        successCount++;
      }
    } else {
      console.log('  ✅ Success');
      successCount++;
    }
  } catch (err) {
    console.log(`  ⚠️  Warning: ${err.message}`);
  }
}

console.log(`\n✅ Migration completed: ${successCount}/${statements.length} statements`);
console.log('✅ Checking if table exists...');

// Verify table was created
const { data, error } = await supabase
  .from('device_settings')
  .select('count')
  .limit(1);

if (!error) {
  console.log('✅ Table "device_settings" is ready!');
} else {
  console.log('⚠️  Table check:', error.message);
}
