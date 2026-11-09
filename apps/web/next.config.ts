import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@church/shared'],
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
