/** @type {import('next').NextConfig} */

// Days since 2026-01-01, zero-padded to 3 digits → format 0.076
const days = Math.floor((Date.now() - new Date('2026-01-01').getTime()) / 86400000);
const buildVersion = String(days).padStart(3, '0');

const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
};

module.exports = nextConfig;
