import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env['NEXT_DIST_DIR'] ?? '.next',
  // Keep type-checking in-process; detached CLI workers are unavailable in
  // some restricted build environments.
  experimental: { useTypeScriptCli: false },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env['VERITY_API_ORIGIN'] ?? 'http://127.0.0.1:3001'}/api/:path*`,
      },
    ];
  },
};

export default config;
