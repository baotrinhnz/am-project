/** @type {import('next').NextConfig} */
const { execSync } = require('child_process');
const path = require('path');

let buildVersion = '00';
try {
  // .git is in the repo root (parent of dashboard/)
  const repoRoot = path.resolve(__dirname, '..');
  buildVersion = execSync('git rev-list --count HEAD', { cwd: repoRoot }).toString().trim();
} catch {}

const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
};

module.exports = nextConfig;
