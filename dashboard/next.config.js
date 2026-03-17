/** @type {import('next').NextConfig} */

// Build date as version: YYMMDD.HHMM  e.g. 260317.1845
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const buildVersion = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}.${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;

const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
};

module.exports = nextConfig;
