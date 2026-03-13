const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../raspberry-pi/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  console.error('Please check your .env file in the raspberry-pi directory');
  process.exit(1);
}

// Migration files to run
const migrations = [
  {
    file: 'create_music_detections_table.sql',
    description: 'Music detections table for storing detected songs'
  },
  {
    file: 'create_device_commands_table.sql',
    description: 'Device commands table for remote control'
  }
];

async function runMigration(sqlFile, description) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(__dirname, 'migrations', sqlFile);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ Migration file not found: ${filePath}`);
      return reject(new Error('File not found'));
    }

    const sql = fs.readFileSync(filePath, 'utf8');

    // Use raw SQL endpoint
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);

    const postData = JSON.stringify({ query: sql });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(`\n🔄 Running migration: ${sqlFile}`);
    console.log(`   ${description}`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          console.log(`✅ Migration completed successfully`);
          resolve();
        } else if (res.statusCode === 404 && data.includes('exec_sql')) {
          // RPC function doesn't exist, try alternative method
          console.log('⚠️  exec_sql RPC not found, please run migrations manually in Supabase dashboard');
          console.log('   Go to: SQL Editor → New Query → Paste the SQL from migration files');
          reject(new Error('exec_sql not available'));
        } else {
          console.error(`❌ Migration failed with status ${res.statusCode}`);
          console.error('Response:', data);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function runAllMigrations() {
  console.log('🎵 Music Recognition Tables Migration');
  console.log('=' .repeat(50));
  console.log(`📡 Supabase URL: ${SUPABASE_URL}`);

  let success = 0;
  let failed = 0;

  for (const migration of migrations) {
    try {
      await runMigration(migration.file, migration.description);
      success++;
    } catch (error) {
      failed++;
      console.error(`⚠️  Skipping ${migration.file} due to error`);
    }
  }

  console.log('\n' + '=' .repeat(50));
  console.log(`📊 Results: ${success} successful, ${failed} failed`);

  if (failed > 0) {
    console.log('\n📝 Manual Migration Instructions:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Click "New Query"');
    console.log('4. Copy and paste the SQL from:');
    migrations.forEach(m => {
      console.log(`   - supabase/migrations/${m.file}`);
    });
    console.log('5. Click "Run" to execute the SQL');
  } else {
    console.log('\n✨ All migrations completed successfully!');
    console.log('The dashboard should now work without errors.');
  }
}

// Run migrations
runAllMigrations().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});