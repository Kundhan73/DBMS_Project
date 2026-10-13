import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // native / heavy server-only packages are loaded from node_modules at runtime
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'pg'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};

export default nextConfig;
