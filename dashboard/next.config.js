/** @type {import('next').NextConfig} */
const { execSync } = require('child_process');

let buildVersion = '00';
try {
  buildVersion = execSync('git rev-list --count HEAD', { cwd: __dirname }).toString().trim();
} catch {}

const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
};

module.exports = nextConfig;
