import type { NextConfig } from 'next';
import path from 'path';

const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // monorepo: trace workspace packages from the repository root
  outputFileTracingRoot: path.join(__dirname, '../..'),
  poweredByHeader: false,
  transpilePackages: ['@tanda/shared'],
  // Same-origin proxy keeps the httpOnly refresh cookie first-party (ADR D10).
  async rewrites() { return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }]; },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
    ] }];
  },
};
export default config;
