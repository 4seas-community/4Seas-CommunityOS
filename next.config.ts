import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 4Seas CommunityOS is a modular monolith; keep the build strict & simple.
  eslint: { ignoreDuringBuilds: true },
  typedRoutes: false,
  // Required by @opennextjs/cloudflare (Workers deployment).
  output: 'standalone',
};

export default nextConfig;
