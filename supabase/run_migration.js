const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../raspberry-pi/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  process.exit(1);
}

// Read SQL migration file
const sqlFile = path.join(__dirname, 'migrations/001_device_settings.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

// Parse URL
const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);

// Prepare request data
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

console.log('🔄 Running migration: 001_device_settings.sql');
console.log(`📡 Supabase URL: ${SUPABASE_URL}`);

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 204) {
      console.log('✅ Migration executed successfully!');
      console.log('✅ Table "device_settings" created');
      console.log('✅ Indexes, policies, and triggers configured');
    } else {
      console.error(`❌ Migration failed with status ${res.statusCode}`);
      console.error('Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
});

req.write(postData);
req.end();
