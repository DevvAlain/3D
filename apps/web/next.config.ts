import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default function nextConfig(phase: string): NextConfig {
  return {
    // Isolate `next dev` artifacts from `next build` so running both never corrupts chunks
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
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
    async headers() {
      return [
        {
          source: '/sw.js',
          headers: [
            {
              key: 'Cache-Control',
              value: 'public, max-age=0, must-revalidate',
            },
            {
              key: 'Service-Worker-Allowed',
              value: '/',
            },
          ],
        },
      ];
    },
  };
}
